"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const xml_reader_1 = __importDefault(require("xml-reader"));
const xml_query_1 = __importDefault(require("xml-query"));
const msal_node_1 = require("@azure/msal-node");
const axios_1 = __importDefault(require("axios"));
const tl = require("azure-pipelines-task-lib/task");
function addRange(set, itemsToAdd) {
    for (const item of itemsToAdd) {
        set.add(item);
    }
}
function run() {
    // Parameters
    const inputFolder = tl.getPathInput("inputFolder", true, true);
    const authority = tl.getInput("authority", true);
    const clientId = tl.getInput("clientId", true);
    const clientSecret = tl.getInput("clientSecret", true);
    if (!inputFolder || !authority || !clientId || !clientSecret) {
        // This should not happen as we specified required: true for all params
        // But TS is not happy if we don't check for it
        tl.setResult(tl.TaskResult.Failed, "One or more parameters missing");
        return;
    }
    // Read policy files (and the PolicyId attribute from each)
    // Get the parent policy for each
    // Then we can publish them in order from parents to children
    const policyFilesAndIds = tl
        .ls("", [inputFolder])
        .filter((f) => f.endsWith(".xml"))
        .map((fileName) => {
        const ast = xml_reader_1.default.parseSync(fs_1.default.readFileSync(path_1.default.join(inputFolder, fileName), "utf-8"));
        const xq = (0, xml_query_1.default)(ast);
        const policyId = xq.find("TrustFrameworkPolicy").attr("PolicyId");
        const parentId = xq.find("BasePolicy").find("PolicyId").text();
        return {
            id: policyId,
            parentId,
            file: fileName,
        };
    });
    if (policyFilesAndIds.length === 0) {
        tl.setResult(tl.TaskResult.Failed, "No policy files found");
        return;
    }
    const policyDeploymentSets = [];
    const addedPolicies = new Set();
    // First find the ones without a parent policy,
    // they can be deployed first as they don't depend on other policies
    const firstDeploymentSet = policyFilesAndIds
        .filter((x) => x.parentId === "")
        .map((x) => x.id);
    policyDeploymentSets.push(firstDeploymentSet);
    addRange(addedPolicies, firstDeploymentSet);
    let somethingWasAdded = false;
    do {
        // Add the policies which have not been added yet
        // and whose parent policy has already been added
        const deploymentSet = policyFilesAndIds
            .filter((x) => !addedPolicies.has(x.id) && addedPolicies.has(x.parentId))
            .map((x) => x.id);
        policyDeploymentSets.push(deploymentSet);
        const countBefore = addedPolicies.size;
        addRange(addedPolicies, deploymentSet);
        somethingWasAdded = addedPolicies.size > countBefore;
        // Repeat while a deployment set was added and there are policies left
    } while (somethingWasAdded && policyFilesAndIds.length > addedPolicies.size);
    if (policyFilesAndIds.length > addedPolicies.size) {
        for (const policy of policyFilesAndIds) {
            tl.debug(`Policy ${policy.id} base policy ${policy.parentId} was not found or its base policy was also not found`);
        }
        tl.setResult(tl.TaskResult.Failed, "Some policies cannot be deployed due to missing base policy");
        return;
    }
    const uploadPolicies = () => __awaiter(this, void 0, void 0, function* () {
        // Authenticate with client credentials
        const app = new msal_node_1.ConfidentialClientApplication({
            auth: {
                clientId,
                authority,
                clientSecret,
            },
        });
        const authResult = yield app.acquireTokenByClientCredential({
            scopes: ["https://graph.microsoft.com/.default"],
        });
        if (authResult === null) {
            throw new Error("Unable to acquire access token for MS Graph API");
        }
        tl.debug("MS Graph API access token acquired");
        // Send each policy to Graph API
        for (const deploymentSet of policyDeploymentSets) {
            // Sets are deployed in order so that parent policies
            // are always deployed first
            tl.debug(`Deploying set of ${deploymentSet.length} policies`);
            for (const policyId of deploymentSet) {
                tl.debug(`Publishing policy: ${policyId}`);
                const file = path_1.default.join(inputFolder, policyFilesAndIds
                    .filter((x) => x.id === policyId)
                    .map((x) => x.file)[0]);
                const url = `https://graph.microsoft.com/beta/trustFramework/policies/${policyId}/$value`;
                yield axios_1.default.put(url, fs_1.default.createReadStream(file), {
                    headers: {
                        Authorization: `Bearer ${authResult.accessToken}`,
                        "Content-Type": "application/xml",
                    },
                });
                tl.debug(`Published policy: ${policyId}`);
            }
        }
    });
    uploadPolicies()
        .then(() => {
        console.log(`Successfully uploaded ${addedPolicies.size} policies`);
    })
        .catch((err) => {
        var _a;
        tl.error(`Policy upload failed: ${err === null || err === void 0 ? void 0 : err.message}`);
        if (err.isAxiosError) {
            const error = err;
            tl.error(`API response: ${JSON.stringify((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data)}`);
        }
        tl.setResult(tl.TaskResult.Failed, "Policy upload failed");
    });
}
run();

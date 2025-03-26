"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tl = require("azure-pipelines-task-lib/task");
function run() {
    var _a, _b;
    // Parameters
    const env = tl.getInput("environment", true);
    const inputFolder = tl.getPathInput("inputFolder", true, true);
    const outputFolder = tl.getPathInput("outputFolder", true, false);
    const additionalArgumentsInput = tl.getDelimitedInput("additionalArguments", /\r?\n/, false);
    let appsettingsFile = tl.getPathInput("appsettingsFile", false, true);
    if (env === undefined ||
        inputFolder === undefined ||
        outputFolder === undefined) {
        tl.setResult(tl.TaskResult.Failed, "A parameter is missing");
        return;
    }
    if (!appsettingsFile) {
        appsettingsFile = path_1.default.join(inputFolder, "appsettings.json");
    }
    const additionalArguments = additionalArgumentsInput
        .filter((arg) => arg.indexOf("=") >= 0)
        .map((arg) => {
        const delimiterIndex = arg.indexOf("=");
        return {
            key: arg.substring(0, delimiterIndex),
            value: arg.substring(delimiterIndex + 1),
        };
    });
    if (!tl.exist(outputFolder)) {
        tl.mkdirP(outputFolder);
    }
    const settings = JSON.parse(fs_1.default.readFileSync(appsettingsFile, "utf-8"));
    if (!settings) {
        tl.setResult(tl.TaskResult.Failed, "Unable to read appsettings.json", true);
        return;
    }
    if (!settings.Environments || settings.Environments.length === 0) {
        tl.setResult(tl.TaskResult.Failed, "No Environments specified in appsettings.json", true);
        return;
    }
    const envSettings = settings.Environments.filter((s) => !!s && s.Name === env)[0];
    if (!envSettings) {
        tl.setResult(tl.TaskResult.Failed, `Environment "${env}" was not found in Environments of appsettings.json`, true);
        return;
    }
    if (!envSettings.Tenant) {
        tl.setResult(tl.TaskResult.Failed, "Tenant not set in appsettings.json for environment", true);
        return;
    }
    // Override/add settings from additional arguments
    (_a = envSettings.PolicySettings) !== null && _a !== void 0 ? _a : (envSettings.PolicySettings = {});
    for (const additionalArgument of additionalArguments) {
        envSettings.PolicySettings[additionalArgument.key] =
            additionalArgument.value;
    }
    const policyFiles = tl
        .ls("", [inputFolder])
        .filter((f) => f.endsWith(".xml"));
    tl.debug(`${policyFiles.length} XML files found in input folder`);
    if (policyFiles.length === 0) {
        tl.setResult(tl.TaskResult.Failed, "No XML files found in input folder", true);
        return;
    }
    for (const policyFile of policyFiles) {
        tl.debug(`Replacing placeholders in ${policyFile}`);
        let fileContent = fs_1.default.readFileSync(path_1.default.join(inputFolder, policyFile), "utf-8");
        // Tenant is a special setting
        tl.debug(`Replacing {Settings:Tenant} with ${envSettings.Tenant}`);
        fileContent = fileContent.replace(/{Settings:Tenant}/g, envSettings.Tenant);
        // Go through and replace all of the other settings
        for (const policySettingKey of Object.keys((_b = envSettings.PolicySettings) !== null && _b !== void 0 ? _b : {})) {
            tl.debug(`Replacing {Settings:${policySettingKey}} with ${envSettings.PolicySettings[policySettingKey]}`);
            fileContent = fileContent.replace(new RegExp(`{Settings:${policySettingKey}}`, "g"), envSettings.PolicySettings[policySettingKey]);
        }
        // Write final version to output
        const outputFile = path_1.default.join(outputFolder, policyFile);
        tl.debug(`Writing policy file ${outputFile}`);
        tl.writeFile(outputFile, fileContent);
    }
    console.log(`Wrote ${policyFiles.length} policies to output folder`);
}
run();
tl.setResult(tl.TaskResult.Succeeded, "");

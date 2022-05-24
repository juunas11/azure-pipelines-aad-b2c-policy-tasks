import fs from "fs";
import path from "path";
import XmlReader from "xml-reader";
import xmlQuery from "xml-query";
import { ConfidentialClientApplication } from "@azure/msal-node";
import axios, { AxiosError } from "axios";
import tl = require("azure-pipelines-task-lib/task");

function addRange(set: Set<string>, itemsToAdd: readonly string[]) {
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
      const ast = XmlReader.parseSync(
        fs.readFileSync(path.join(inputFolder, fileName), "utf-8")
      );
      const xq = xmlQuery(ast);
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

  const policyDeploymentSets: string[][] = [];
  const addedPolicies = new Set<string>();

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
      tl.debug(
        `Policy ${policy.id} base policy ${policy.parentId} was not found or its base policy was also not found`
      );
    }

    tl.setResult(
      tl.TaskResult.Failed,
      "Some policies cannot be deployed due to missing base policy"
    );
    return;
  }

  const uploadPolicies = async () => {
    // Authenticate with client credentials
    const app = new ConfidentialClientApplication({
      auth: {
        clientId,
        authority,
        clientSecret,
      },
    });
    const authResult = await app.acquireTokenByClientCredential({
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
        const file = path.join(
          inputFolder,
          policyFilesAndIds
            .filter((x) => x.id === policyId)
            .map((x) => x.file)[0]
        );
        const url = `https://graph.microsoft.com/beta/trustFramework/policies/${policyId}/$value`;

        await axios.put(url, fs.createReadStream(file), {
          headers: {
            Authorization: `Bearer ${authResult.accessToken}`,
            "Content-Type": "application/xml",
          },
        });
        tl.debug(`Published policy: ${policyId}`);
      }
    }
  };

  uploadPolicies()
    .then(() => {
      console.log(`Successfully uploaded ${addedPolicies.size} policies`);
    })
    .catch((err) => {
      tl.error(`Policy upload failed: ${err?.message}`);
      if (err.isAxiosError) {
        const error = err as AxiosError;
        tl.error(`API response: ${JSON.stringify(error?.response?.data)}`);
      }

      tl.setResult(tl.TaskResult.Failed, "Policy upload failed");
    });
}

run();

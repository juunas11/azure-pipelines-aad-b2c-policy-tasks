# Build and publish Azure AD B2C custom policies

This extension contains two Azure Pipelines tasks:

- Build Azure AD B2C policies
- Publish Azure AD B2C policies

## Building policies

The build task expects the settings format used with the
[Azure AD B2C Visual Studio Code extension](https://marketplace.visualstudio.com/items?itemName=AzureADB2CTools.aadb2c).
An example appsettings.json file could look like this:

```json
{
  "Environments": [
    {
      "Name": "Production",
      "Production": true,
      "Tenant": "yourb2ctenant.onmicrosoft.com",
      "PolicySettings": {
        "ProxyIdentityExperienceFrameworkAppId": "c74d6563-ac03-4b08-9314-688cb1e9a8e0",
        "IdentityExperienceFrameworkAppId": "00fda17e-690e-47b6-9614-739556e731c3"
      }
    }
  ]
}
```

The policy XML files (located in the same folder) can utilize placeholders that are replaced by the build task:

```xml
<TrustFrameworkPolicy TenantId="{Settings:Tenant}">
</TrustFrameworkPolicy>
```

Or:

```xml
<Item Key="client_id">{Settings:ProxyIdentityExperienceFrameworkAppId}</Item>
```

Usage example in YAML:

```yml
- task: b2c-policy-build@1
  displayName: Build policies
  inputs:
    environment: "Production"
    inputFolder: "$(Build.Repository.LocalPath)/Policies"
    outputFolder: "$(Build.ArtifactStagingDirectory)/policies"
    additionalArguments: |
      ApiUrl=https://test.com
      SecondSetting=$(SecondSetting)
```

Three parameters are required:

1. environment: a valid environment name from appsettings.json
1. inputFolder: the folder that contains the policy XML files and the appsettings.json file
1. outputFolder: the folder where the resulting policies are put into (will be created if does not exist)

The fourth parameter `additionalArguments`, is optional.
It allows you to override settings in appsettings.json, or add ones that are missing from there.
You could for example use pipeline variables.
There is an example above of its usage; you specify one setting per line in the format `Key=Value`.

## Publishing policies

The publish task takes policy XML files that are ready to publish and uploads them to your Azure AD B2C tenant.
It looks at the policies' base policies to publish the base policies first before the policies that require them.

To publish policies, you need to first create an app registration in the Azure AD B2C tenant.

1. Login to Azure Portal, ensure you are in the Azure AD B2C tenant
1. Open the Azure AD B2C settings blade (you can search for Azure AD B2C in the search bar)
1. Go to _App registrations_
1. Click _New registration_
1. Enter any name you want
1. Select _Accounts in this organizational directory only_ as the supported account type
1. You do not need a redirect URI and you don't need to grant openid or offline_access scope
1. Click _Register_
1. Copy the _Application (client) ID_ and the _Directory (tenant) ID_, they are needed for the publish task
1. Go to _Certificates & secrets_, and add a new _client secret_. Copy it somewhere as well, it is needed for the publish
1. Go to _API permissions_
1. Click _Add a permission_
1. Select _Microsoft Graph_
1. Select _Application permissions_
1. Find _Policy.ReadWrite.TrustFramework_ and select it
1. Click _Add permissions_
1. Finally, click _Grant admin consent for..._

The app registration is now ready, and you should have the tenant id, client id and client secret.

Usage example in YAML:

```yml
- task: b2c-policy-publish@1
  displayName: Publish policies
  inputs:
    inputFolder: "$(Build.ArtifactStagingDirectory)/policies"
    authority: "https://login.microsoftonline.com/your-tenant-id-here"
    clientId: "your-client-id-here"
    clientSecret: "$(ClientSecret)"
```

Four parameters are required:

1. inputFolder: the folder where ready to publish policy XML files are located in (I've used the outputFolder from the build task here)
1. authority: identifies the B2C tenant; this will be passed to MSAL.js as the authority setting, usually this would be `https://login.microsoftonline.com/your-tenant-id-here`
1. clientId: the client id from the app registration
1. clientSecret: the client secret from the app registration (I recommend using a variable set as secret for this at least)

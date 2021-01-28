Set-Location .\B2CPolicyBuilder

npm install
npm run publish
npm prune --production

Set-Location ..\B2CPolicyPublisher

npm install
npm run publish
npm prune --production

Set-Location ..

tfx extension create --manifest-globs vss-extension.json
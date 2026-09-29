# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`fullstack-serverless` is a Serverless Framework plugin (plain CommonJS, no build step) that adds a CloudFront distribution in front of an S3-hosted static site and, optionally, API Gateway. This copy of the MadSkills-io plugin has been patched for Serverless v3/v4 compatibility. User-facing config options and CLI flags are documented in `README.md`.

## Commands

There is no build, lint, or test tooling. `package.json` defines no scripts and there is no test suite. `npm install` is the only setup step.

To exercise changes, link the plugin into a real Serverless project (`npm link` here, then `npm link fullstack-serverless` in the consumer project) and run `serverless package` to inspect the generated CloudFormation in `.serverless/`. `serverless deploy` or `serverless client deploy` hit real AWS.

## Architecture

Everything is wired through the `ServerlessFullstackPlugin` class in `index.js`, which registers Serverless lifecycle hooks and a `client` command (`client deploy`, `client remove`).

**Infrastructure (package time):**
- `lib/resources/resources.yml` is a template that contains *every* optional feature, with placeholder values (`domain.tld`, `arn`, `waf-id`, `WebAppS3BucketName`, etc.).
- On `package:createDeploymentArtifacts`, `prepareResources()` runs a chain of `prepare*` methods that either fill in each section from `custom.fullstack` config or **delete** it when it isn't configured. The result is `_.merge`d into `compiledCloudFormationTemplate`. When you add a config option, add both the template section and a `prepare*` method that fills it in or deletes it.
- `singlePageApp` switches between two S3 access modes. When true, CloudFront reads through the S3 Origin Access Identity (`S3OriginConfig`), the public-read bucket policy is removed, and 403 errors map to the index doc. When false, CloudFront uses the S3 *website* endpoint as a custom origin, and the OAI resource and its policy statement are removed.
- `before:aws:package:finalize:mergeCustomProviderResources` (`checkForApiGataway`) runs after Serverless compiles its own resources. If there is no `ApiGatewayRestApi` resource and no `provider.apiGateway.restApiId` or `apiGatewayRestApiId`, it strips the `ApiGateway` origin and cache behavior.
- The `ApiGateway` origin's `OriginPath` is set to `/<stage>`. Its cache behavior's `PathPattern` is `<apiPath>/*`.

**Client deploy (after stack update, or `serverless client deploy`):**
- `generateClient` spawns `clientCommand` in `clientSrcPath`, with `provider.environment` merged into `process.env`.
- `processDeployment` validates config (`lib/validate.js`, which throws an *array* of error strings), asks for confirmation (`lib/confirm.js`, plain `readline`; Enter means yes), empties the bucket (`lib/bucketUtils.js`), and uploads `distributionFolder` (`lib/upload.js`, which applies `objectHeaders` specs in this order: `ALL_OBJECTS`, then folder, then file). It then invalidates CloudFront (`lib/cloudFront.js`, which looks up the distribution through the stack's `ApiDistribution` logical ID and polls until the invalidation completes).
- `serverless remove` triggers `client remove` first, which empties the bucket so CloudFormation can delete it.

## Conventions and gotchas

- **Bucket naming:** the real bucket name is always `<service>-<stage>-<bucketName>` (`getBucketName`). This applies to both the CFN resource and the deploy/remove operations.
- **CLI options across Serverless versions:** always read the plugin's boolean flags through `getCLIOptions(name)`, not `this.cliOptions` directly. v3/v4 forbid free-form flags, so users pass `--param="no-delete-contents"`. `getCLIOptions` parses the `param` array (a `no-` prefix means `false`). v2 uses `--no-foo` directly. The version is detected from `serverless.version`'s major number. Adding support for a new major version means updating this check.
- Read config with `getConfig('dotted.path', default)`, which uses `_.get` on `service.custom.fullstack`.
- AWS calls go through the Serverless provider (`this.aws.request(service, method, params)`), not the AWS SDK directly.
- Promises are mostly Bluebird (`BbPromise`), except `lib/cloudFront.js`, which uses async/await. Errors are wrapped in `serverless.classes.Error`.
- There are no generated outputs to keep in sync other than the `ApiDistribution` CFN output, which `printSummary` reads.

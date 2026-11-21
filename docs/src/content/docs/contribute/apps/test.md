---
title: Test the app
description: Required automated checks, synthetic fixtures, and separate provider acceptance for every app.
sidebar:
  order: 7
---

Every app must include a contract fixture and pass the shared offline test framework.

## Run the required command

```sh
pnpm check:apps
```

To exercise one app's protocol fixture, run:

```sh
pnpm check:apps my-app
```

All folders still pass format validation before that selected fixture runs. This prevents a second broken folder from entering a release.

The command runs from `pnpm check` and always runs in the required CI workflow. Application integration tests also exercise every shipped app. App JSON changes select the full integration suite in CI.

## What the framework checks

| Check                            | Failure caught                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Standard schemas and Nod profile | Misspelled fields, missing fixtures, unsupported transports, and incomplete setup                    |
| Shared typed contract            | Wrong types, unknown fields, invalid authentication combinations, and stale generated editor schemas |
| Tool schema validation           | Invalid JSON Schema 2020-12 and sample inputs that violate its constraints                           |
| Package path checks              | Files or links that leave their app directory                                                        |
| Shared skill loading             | Invalid metadata, duplicate skill names, and invalid references                                      |
| MCP discovery                    | A read tool that is lost during protocol negotiation                                                 |
| Authentication headers           | A token sent with the wrong scheme or to a different endpoint                                        |
| Read request and response        | Changed arguments or damaged structured data                                                         |
| Provider and tool failures       | A specific reason that is lost or converted into success                                             |
| Permission and rate failures     | A failed call that is sent more than once                                                            |
| Stop before dispatch             | A cancelled call that reaches the provider                                                           |

The shared integration suite covers the common Apps and Connect flow for MCP, API, and CLI apps. It checks private setup, OAuth completion, read verification, reconnect, account ownership, revoked access, credential removal, and Trust. API cases include custom authentication headers and GraphQL reads. CLI cases include multiple credential fields, short IDs, JSON and text reads, and failed verification. OAuth API cases use the real client with synthetic endpoints to check PKCE, registration, client IDs, token refresh, and issuer mismatch. Contributors must extend it when a new setup behavior requires a new branch.

## Keep the fixture useful

Use the provider's documented tool name, required input fields, and realistic response shape. Add its documentation URL in `source`. Replace private IDs, names, URLs, and content with synthetic values.

Do not add a test that asserts only that the manifest equals itself. Test requests, saved account bindings, failure handling, or another observable connection contract.

The framework runs the real Nod HTTP or MCP transport against synthetic responses. CLI checks run a controlled child process with separate arguments, environment, stdout, stderr, and exit status. Offline checks never install or run a contributor’s real CLI package. No automated test may contact a live model, connected account, or real recipient.

## Run wider checks when needed

```sh
pnpm exec tsx --test tests/integrations.test.ts
pnpm --dir docs build
```

Database cases need `TEST_DATABASE_URL` for a disposable PostgreSQL fixture. Without it, those cases are skipped. The repository's Linux integration runner creates isolated fixtures and treats skipped cases as failures.

For a runtime change, run the relevant integration cases with that fixture or use `pnpm test:integration`. Never point tests at your normal local database.

Review the app page at desktop and mobile widths. Open its `social.png` image and check the title, logo, description, and crop.

## Provider acceptance is separate

Offline tests cannot establish whether an external service is available, its OAuth application is configured correctly, or a published CLI installs and works.

Before approval, record a separate provider acceptance check with a disposable account and synthetic content. Check sign-in, a known read, reconnect, and disconnect. Check every advertised authentication method. For a CLI, install the exact declared source in the sealed runtime and run its read check. Confirm the package supports Linux and the documented output format. Confirm denied access produces a useful reason.

For write support, use a reversible synthetic record in that disposable account. Verify the result and clean it up. Do not contact real recipients. Keep this work outside automated tests and obtain the account operator's authorization.

Record the provider version when available, the date, the methods checked, and any limits in the PR. Keep credentials and private content out of the evidence.

## Related resources

- [Build an app for Nod](/contribute/apps/)
- [Format reference](/contribute/apps/format/)
- [Approval requirements](/contribute/apps/approval/)
- [Checks and tests](/contribute/checks-and-tests/)

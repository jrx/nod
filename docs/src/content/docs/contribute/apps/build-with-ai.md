---
title: Build an app with AI
description: Use the repository's Agent Skill and scaffold command to create and check a Nod app.
sidebar:
  order: 9
---

Use the `create-nod-app` Agent Skill with the same scaffold and checks used by human contributors.

The skill lives at [`.agents/skills/create-nod-app/SKILL.md`](https://github.com/n8n-io/nod/blob/main/.agents/skills/create-nod-app/SKILL.md). It uses the open Agent Skills format.

## Start from the Nod repository

In an agent that discovers repository Agent Skills, ask:

```text
Use $create-nod-app to add an app for <service>.
Use the provider's official documentation. Choose its MCP server, HTTP API, or CLI.
Scaffold the app, add synthetic contract data, and run the required checks.
Report provider checks separately from offline test results.
```

If the agent does not discover `.agents/skills`, ask it to read that `SKILL.md` path first. No provider key is needed to generate files or run the offline checks.

## What the skill does

The skill checks the supported interface, reads the provider's official contract, and runs `pnpm create:app`. It fills the manifest and required fixture, then runs `pnpm check:apps` and the relevant integration checks.

It also checks the generated public page and social preview. It reports missing provider acceptance instead of inventing a successful sign-in.

## Review the result

Check the interface, authentication, required account plan, read operation, and example requests. For CLI apps, check the exact package or download source and credential labels. Confirm the public page does not promise unsupported work.

For MCP apps, check the server address, OAuth scopes, and exact tool names against the provider's official documentation.

AI output still needs the [approval review](/contribute/apps/approval/). The skill cannot grant permissions, create a provider OAuth application, or approve the contribution.

## Related resources

- [Build an app for Nod](/contribute/apps/)
- [Build your first app](/contribute/apps/build/)
- [Test the app](/contribute/apps/test/)

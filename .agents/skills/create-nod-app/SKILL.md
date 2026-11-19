---
name: create-nod-app
description: Create or update a Nod app folder, its required synthetic contract fixture, and its public docs listing. Use for community or partner app contributions in the Nod repository.
---

Build the app in the Nod repository. Read `AGENTS.md` and `docs/src/content/docs/contribute/apps/index.md` first. Read the format, testing, and approval pages before editing a connection.

Use official provider documentation to choose an MCP server, HTTP API, or non-interactive CLI. Check authentication, permissions, required plans, and a read operation. APIs and CLIs connect directly through the same app format. Read `docs/src/content/docs/contribute/apps/api-and-cli.md` for those methods.

Run `pnpm create:app <app-id> --type <mcp|http|cli> --auth <method>`. For MCP and API apps, supply `--url` and choose `oauth2`, `bearer`, or `x-api-key`. For a CLI, choose `--auth env`, set `--command`, repeat `--env` for private credential fields, and select one pinned `--npm`, `--pypi`, or `--download` source. Downloads require `--sha256`. Use n8n's folder for owner-supplied instance setup. Keep existing app IDs stable.

For API OAuth, use provider discovery or documented RFC 8414 metadata. Use S256 PKCE and the public-client flow. Set `clientIdRequired` when a user must register a client. Keep credentials out of metadata. For a CLI, confirm Linux support and an exact install source. Use argument arrays, never a shell string. Give credential fields clear user-facing labels. The required read must finish without a terminal and must have no write effects.

Complete all generated fields. Put maintainer details in `plugin.json`, Nod settings in `io.n8n.nod/app.json`, and the read fixture in `io.n8n.nod/contract.json`. Keep the generated schema URLs and manifest reference. Add concrete prompts, requirements, and limits. Use the documented MCP tool and input schema, HTTP request, or CLI argument array. Match the fixture type to the connection. Declare JSON or text CLI output. The same API or CLI read verifies account access during private setup. Keep credentials and private content out of files and prompts.

Keep changes in the app folder unless the shared runtime needs a new supported behavior. Do not change a schema, validator, or shared test to make an invalid app pass. Do not add a service-name branch to make a folder work. Do not weaken URL checks, Trust, credential removal, or account ownership checks.

Run `pnpm check:apps` and the relevant integration tests. Use only synthetic data and disposable database schemas. Report skipped checks. Never use a live model, saved account, or real recipient in automated tests.

The docs catalog and app page come from the manifest. Build the docs and inspect the app page and its `social.png` at desktop and mobile widths. Check the card text and image crop.

Provider acceptance is a separate maintainer step. For CLI apps it includes installing the pinned source in the sealed runtime and checking its real read. For every method it includes sign-in, read, reconnect, and disconnect. Do not claim it passed from offline fixtures. Report the checks run, their results, supported scope, and the remaining provider acceptance work. AI output and passing tests do not grant approval. Do not push, publish, or post to social media without explicit authorization.

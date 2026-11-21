---
title: Plan the app
description: Choose a supported interface, authentication method, scope, and maintainer.
sidebar:
  order: 3
---

Choose the provider interface that supports the work your app promises. MCP, API, and CLI apps use the same contribution process.

## Choose the connection

| Provider interface          | App definition                 | Private setup                                |
| --------------------------- | ------------------------------ | -------------------------------------------- |
| Remote MCP server           | `type: "mcp"`, plus `mcp.json` | OAuth, access token, or API key              |
| REST or GraphQL API         | `type: "http"`                 | OAuth, access token, or API key              |
| Non-interactive service CLI | `type: "cli"`                  | Named credential fields                      |
| User-supplied n8n instance  | MCP owner endpoint             | Instance address, then OAuth or access token |

Nod's API and CLI adapters connect directly. You do not need to build an MCP wrapper.

A user sees one app card and selects **Connect**. The app chooses its connection method. Users enter only the address or credentials the app needs. Protocol and install details stay under **Connection details**.

## Define useful scope

List the service, accounts, read operations, and write operations the app supports. Add concrete example requests. State required plans, roles, scopes, and provider versions.

One app folder describes one service and one connection method. Choose one documented authentication method for a fixed connection. The existing n8n instance setup supports its two declared methods.

Use the provider's supported API or CLI when it better covers the intended work. A connection should not promise operations its interface cannot perform.

## Confirm the provider contract

For MCP, confirm the Streamable HTTP address and read tool schema.

For an API, confirm the HTTPS base address, header or OAuth scheme, read check, request methods, and response shape. Use the provider's OpenAPI document when available. The adapter uses HTTP directly; it does not import an OpenAPI document.

For a CLI, confirm the official install source, exact version, command name, credential environment names, and non-interactive read command. Check its Linux support. Nod runs connected CLIs in its private Linux workspace on every host platform.

CLI reads can return JSON or text. Keep arguments as an array. JSON output must go to stdout. Diagnostic text can go to stderr.

## Plan account setup and maintenance

Use the least access needed for the advertised work. Add a named maintainer and a public contact link. Record provider changes that could require a new version or reconnect.

The read check runs after the user selects **Connect**. It must only verify account access. Never use a write, payment, deletion, message send, or GraphQL mutation as that check.

App metadata, read-only hints, and bundled guides do not grant permission for later calls. Nod applies its normal Trust checks to MCP, API, and CLI actions.

## Related resources

- [Build your first app](/contribute/apps/build/)
- [API and CLI examples](/contribute/apps/api-and-cli/)
- [Format reference](/contribute/apps/format/)
- [Trust and approvals](/trust/approvals/)

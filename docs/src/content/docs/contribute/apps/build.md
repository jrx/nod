---
title: Build your first app
description: Scaffold an MCP, API, or CLI app and complete its required files.
sidebar:
  order: 4
---

Create an app folder with the scaffold command, then replace its unfinished fields.

## Generate the files

Select a method and run the matching command from the repository root. Replace example addresses, package names, and credential names with provider values.

### MCP server

```sh
pnpm create:app my-app --type mcp --name "My App" --url https://mcp.example.com/mcp --auth oauth2
```

MCP is the default when `--type` is omitted. Select `oauth2`, `bearer`, or `x-api-key` authentication.

### HTTP API

```sh
pnpm create:app my-app --type http --name "My App" --url https://api.example.com/v1 --auth bearer
```

Select `oauth2`, `bearer`, or `x-api-key`. Use the [API examples](/contribute/apps/api-and-cli/) for custom key headers, OAuth metadata, and GraphQL read checks.

### Command-line tool

```sh
pnpm create:app my-app --type cli --name "My App" --command mycli --npm @provider/cli@1.2.3 --env PROVIDER_TOKEN --auth env
```

Select one pinned source: `--npm <package@version>`, `--pypi <package==version>`, or `--download <binary-url> --sha256 <digest>`. Repeat `--env` for each required credential. Give each field a clear label in the generated app file.

The command rejects invalid options, unsafe addresses, and unpinned CLI sources. It writes files only. It does not contact providers or install commands. The example addresses are reserved and must be replaced before running the command.

All methods use this layout. Only fixed MCP apps include `mcp.json`:

```text
src/apps/my-app/
  plugin.json
  mcp.json
  io.n8n.nod/
    app.json
    contract.json
```

The command refuses to replace an existing directory. The generated placeholders deliberately fail validation until you complete them.

## Complete the manifest

Set the maintainer, description, and version in `plugin.json`. Keep its Nod reference unchanged.

Edit `io.n8n.nod/app.json`:

1. Set the display name.
2. Add concrete example requests in `prompts`.
3. State account, plan, scope, and provider-version requirements.
4. State unsupported behavior in `limitations`.
5. Complete the typed connection fields for the selected method. Add OAuth scopes only when the provider requires them.

For an icon, add `io.n8n.nod/icon.svg` and set `icon` to `./io.n8n.nod/icon.svg`. PNG and WebP are also supported. Keep the image under 128 KB. Use letters, digits, underscores, or hyphens in asset names.

Keep the generated `$schema` values. Editors that support JSON Schema use them for field completion and error checks. CI uses the same definitions.

Do not put tokens, passwords, private server addresses, or customer data in these files.

## Complete the required fixture

Edit `io.n8n.nod/contract.json`. Set `source` to the provider documentation. Complete the read tool, HTTP request, or CLI argument array. Use synthetic response data.

API and CLI apps use this same read operation to verify access during setup. The offline framework uses synthetic responses or a controlled child process. It never calls the real provider. See [Test the app](/contribute/apps/test/).

## Add a guide when needed

Use `skills/<app-id>/SKILL.md` for procedures the model cannot infer from the interface. API and CLI apps should describe supported operations and link to provider references. Keep required `name` and `description` frontmatter. Put detailed procedures in Markdown reference files.

App skills load with Nod's other guides. Skill names must be unique across the complete library. Credentials and permissions stay in the runtime.

## Check and preview

```sh
pnpm check:apps my-app
pnpm dev
```

Open **Apps** and find the new entry. Review setup without connecting a private account. Run the docs build and preview its catalog page:

Nod reads app definitions at startup. Restart the development server after changing an app folder.

```sh
pnpm --dir docs install --frozen-lockfile
pnpm --dir docs build
pnpm --dir docs preview
```

The page appears at `/docs/connect/community-apps/my-app/`. Its social image is `social.png` under that address.

## Use an instance address

Copy n8n's connection shape when users supply their own server address. Use an owner-supplied endpoint in the Nod extension and omit `mcp.json`. See [Format reference](/contribute/apps/format/).

Only n8n currently uses private or local instance addresses. A new app cannot enable private network access through its manifest.

## Related resources

- [Build an app for Nod](/contribute/apps/)
- [API and CLI examples](/contribute/apps/api-and-cli/)
- [Format reference](/contribute/apps/format/)
- [Test the app](/contribute/apps/test/)

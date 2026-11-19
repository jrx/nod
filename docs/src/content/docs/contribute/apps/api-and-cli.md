---
title: API and CLI examples
description: Add an API or CLI through the same app format, private setup, and required tests.
sidebar:
  order: 5
---

Use the standard `plugin.json` and app metadata for every method. Change the typed `connection` and required read fixture.

The examples use fictional provider data. Replace it with a real provider contract before submission. API and CLI folders omit `mcp.json`.

## API with a private key

In `io.n8n.nod/app.json`, set:

```json
{
  "type": "http",
  "url": "https://api.provider.example/v1",
  "authentication": ["x-api-key"],
  "apiKeyHeader": "X-Access-Key"
}
```

This object is the `connection` field. Use the provider's exact header name. `apiKeyHeader` is optional and defaults to `X-API-Key`. Request control headers such as `Host` and `Cookie` are rejected.

For bearer tokens, use `"authentication": ["bearer"]` and omit `apiKeyHeader`. Nod sends `Authorization: Bearer <token>`. The user enters the value in private setup.

Add this `io.n8n.nod/contract.json`:

```json
{
  "$schema": "https://nod.n8n.io/docs/schemas/apps/v1/contract.schema.json",
  "type": "http",
  "source": "https://provider.example/docs/api",
  "request": { "method": "GET", "path": "account" },
  "annotations": { "readOnlyHint": true },
  "output": { "id": "synthetic-account" }
}
```

Paths are relative to the saved base address. This example checks `/v1/account`. Calls cannot leave that address prefix. Nod sends credentials only through the saved connection.

The runtime supports GET, POST, PUT, PATCH, and DELETE app calls. Connection verification uses a documented GET read or POST read.

## GraphQL read check

Use an API base such as `https://api.provider.example`. Set the fixture's `request` to:

```json
{
  "method": "POST",
  "path": "graphql",
  "body": { "query": "query { viewer { id } }" }
}
```

Keep `annotations.readOnlyHint` true. Review the full query against provider documentation. A GraphQL mutation must never be a connection check.

## API with browser sign-in

Use `"authentication": ["oauth2"]`. Nod uses authorization code sign-in with S256 PKCE, issuer checks, stored refresh tokens, and its existing OAuth client.

Use provider discovery when available. When the provider documents endpoints without discovery, add RFC 8414 metadata:

```json
{
  "type": "http",
  "url": "https://api.provider.example/v1",
  "authentication": ["oauth2"],
  "scopes": ["records:read"],
  "clientIdRequired": true,
  "oauth": {
    "issuer": "https://auth.provider.example",
    "authorization_endpoint": "https://auth.provider.example/authorize",
    "token_endpoint": "https://auth.provider.example/token"
  }
}
```

Nod asks for a client ID in private setup. Register a public OAuth client with the callback URL shown there. The app files contain no client secret or account credential.

When the provider supports Dynamic Client Registration, set `registration_endpoint` in `oauth` and omit `clientIdRequired`. Nod registers the client and stores its state privately.

The supported metadata declares `response_types_supported: ["code"]`, `code_challenge_methods_supported: ["S256"]`, and `token_endpoint_auth_methods_supported: ["none"]`. These values are defaults. Copy `authorization_response_iss_parameter_supported: true` when the provider requires the response issuer parameter. OAuth endpoints must use public HTTPS on port 443.

After sign-in, Nod runs the API read check before it saves the connected account. Subsequent API calls use the same credential refresh and account checks as MCP.

## CLI with private credentials

In `io.n8n.nod/app.json`, set:

```json
{
  "type": "cli",
  "command": "providercli",
  "source": { "npm": "@provider/cli@1.2.3" },
  "authentication": ["env"],
  "environment": {
    "PROVIDER_TOKEN": "Access token",
    "PROVIDER_ACCOUNT_ID": "Account ID"
  }
}
```

The environment object maps provider variable names to user-facing labels. It contains no values. The private setup form asks for those fields. Values can be short account identifiers or long tokens.

Names use uppercase letters, digits, and underscores. They must end in `TOKEN`, `KEY`, `SECRET`, `PASSWORD`, `_ID`, `_SID`, `USERNAME`, `USER`, `EMAIL`, or `URL`. Runtime control variables such as `LD_PRELOAD` are rejected.

Add this fixture:

```json
{
  "$schema": "https://nod.n8n.io/docs/schemas/apps/v1/contract.schema.json",
  "type": "cli",
  "source": "https://provider.example/docs/cli",
  "argv": ["account", "view", "--json"],
  "format": "json",
  "timeoutSeconds": 30,
  "annotations": { "readOnlyHint": true },
  "output": { "id": "synthetic-account" }
}
```

Arguments stay separate. Do not write a shell command string, put credentials in arguments, or use a shell or interpreter as the service command.

Use `format: "text"` and a string `output` for a documented text read. JSON is the default. JSON checks read stdout separately from stderr. A nonzero exit, missing output, invalid JSON, or timeout prevents a Connected result.

The read timeout is one to 120 seconds. Nod checks the read after the user selects **Connect**. The CLI must work without an interactive terminal.

### Pin the install source

Choose exactly one source:

```json
{ "npm": "@provider/cli@1.2.3" }
```

```json
{ "pypi": "provider-cli==1.2.3" }
```

```json
{
  "url": "https://downloads.provider.example/providercli-linux",
  "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

Use the real SHA-256 digest of the download. Direct executables and supported tar or zip archives must contain the declared command for the private workspace’s Linux architecture. Tags such as `latest`, version ranges, and missing download hashes fail validation.

Nod installs the declared source through its existing sealed CLI runner. Credentials reach that install only. Code in the ordinary workspace cannot replace it or change its environment.

## Check all methods the same way

```sh
pnpm check:apps my-app
```

This command checks the schema and runs the synthetic contract for your app. Run the shared integration suite separately:

```sh
pnpm test:integration
```

The integration suite checks private setup, failed verification, reconnect, account ownership, credential removal, errors, and Stop. API OAuth cases also check PKCE, registration, owner client IDs, refresh, and issuer mismatch.

A passing synthetic fixture does not prove the real install source or service works. Complete [provider acceptance](/contribute/apps/test/#provider-acceptance-is-separate) before approval.

## Related resources

- [Build your first app](/contribute/apps/build/)
- [Format reference](/contribute/apps/format/)
- [Test the app](/contribute/apps/test/)

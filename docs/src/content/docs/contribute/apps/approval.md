---
title: Get an app approved
description: The required evidence and maintainer review before an app connection ships with Nod.
sidebar:
  order: 8
---

An app ships after its required tests pass and a maintainer approves the pull request.

Passing a schema check does not make a connection approved. An AI-generated folder has the same requirements as a hand-written contribution.

## Approval requirements

| Area              | Required evidence                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Provider contract | Official documentation for the interface, authentication, permissions, and read operation          |
| Account setup     | Separate provider acceptance for each advertised authentication method                             |
| Useful scope      | Concrete example requests, account requirements, and honest limits                                 |
| Required tests    | Passing `pnpm check:apps` and the applicable integration checks                                    |
| Privacy and Trust | No credentials in files; account bindings, normal Trust checks, and specific errors preserved      |
| Recovery          | Reconnect, disconnect, denied access, and expired or revoked credentials checked                   |
| Writes            | Any advertised write checked with a reversible synthetic record; no automatic replay after failure |
| Public page       | Correct name, icon rights, requirements, examples, limits, links, and social preview               |
| Maintenance       | A named maintainer and a way to report a provider change                                           |

For CLI apps, also check the official source, exact version or download hash, Linux support, private credential fields, and read command. The setup must refuse a failed read. Verify that the command cannot be replaced by ordinary workspace code.

For API apps, check the base address, authentication header or OAuth metadata, read request, and prefix limits. Review any GraphQL read body.

When the contributor supplies the MCP server, include its source or supported service documentation and its own test results. A Nod protocol fixture cannot prove that server's internal behavior.

## Submit the pull request

Include the app ID, provider documentation, required permissions, automated command results, and separate provider acceptance results. State what was not checked.

Use synthetic screenshots or a short recording when they help review setup. Keep acceptance artifacts outside the repository and attach only material suitable for public review.

A maintainer checks the file changes and the evidence. The maintainer can request a narrower scope or refuse unsupported authentication. Authors and AI tools cannot approve their own app by adding a manifest field.

Repository branch protection determines how GitHub enforces maintainer approval. The app validator does not grant review approval or change branch protection.

## What the public page means

The catalog lists app definitions included in Nod. It is not a live status page, certification, or provider endorsement. The page version identifies the app definition, not the provider's current health.

Approval applies to the reviewed scope and version. It does not guarantee future provider availability. Report broken setup or changed permissions through the linked app source.

## Maintain the connection

Run the required tests when an address, scope, authentication method, or fixture changes. Record new provider acceptance for changes that affect sign-in or supported work.

Keep existing app IDs stable so saved accounts keep their service binding. Explain migrations and any required reconnect. New permissions must go through the provider's consent flow.

## Related resources

- [Build an app for Nod](/contribute/apps/)
- [Test the app](/contribute/apps/test/)
- [Pull requests and releases](/contribute/pull-requests/)

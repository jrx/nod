# Contributing to Nod

Thanks for helping improve Nod. The full guide is in the docs: [Contribute to Nod](docs/src/content/docs/contribute/index.mdx). This page has the essentials.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Create an app connector.** Follow [Creating your own connectors](docs/src/content/docs/contribute/apps/index.md) for MCP, HTTP API, and CLI formats, the AI builder skill, required tests, and approval process. Browse [custom connections](https://nod.n8n.io/docs/connect/community-apps/) for examples.
- **Improve the documentation.** Follow [Write docs](docs/src/content/docs/contribute/write-docs.mdx). You can preview and build the docs site without running Nod.
- **Report a bug** with the [bug report form](https://github.com/n8n-io/nod/issues/new/choose).
- **Ask a question or share an idea** in [Discussions](https://github.com/n8n-io/nod/discussions).
- **Report a vulnerability** privately, as described in the [security policy](SECURITY.md). Never in a public issue.
- **Send a pull request.** App-only contributions that use the supported profile follow the app guide. For other work larger than a small fix, open an issue or discussion first.

## Documentation-only changes

For a docs-only change, you do not need to install or run Nod, start Docker, or connect a model. You need Node.js 24.21.0 or newer and pnpm 10.34.5 installed. From the repository root, install the docs dependencies and start the site:

```sh
pnpm --dir docs install --frozen-lockfile
pnpm --dir docs dev
```

Open `http://localhost:4321/docs/` to preview your changes. Before opening a pull request, build the site and check its internal links:

```sh
pnpm --dir docs build
```

See [Write docs](docs/src/content/docs/contribute/write-docs.mdx) for the house style and page guidance.

## Set up and check

For application changes, follow [Install from source](docs/src/content/docs/get-started/install-from-source.mdx), then run Nod with automatic reload:

```sh
pnpm run dev
```

Use your own model key and accounts. Run checks that match the files and behavior you change. Documentation and media changes need formatting, link, and visual checks, without application tests or builds. Build the docs site when its pages, configuration, or code change.

For application changes, start with focused tests. Run broader checks only when needed to verify the affected behavior. See [Checks and tests](docs/src/content/docs/contribute/checks-and-tests.md).

## Pull requests

- Use a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) title, such as `fix(backend): handle a missing session`.
- Keep each pull request to one change, fill in the template, and explain why and how you tested it.
- For a feature a user can see, add a short [feature video](docs/src/content/docs/contribute/feature-videos.md).
- Call out changes to approvals, the trust check, Vault, sign-in, the sandbox or owner isolation.
- Keep keys, credentials and private content out of code, tests, logs and screenshots.
- Update the docs in [`docs/`](docs/README.md) when setup or behaviour changes.

A maintainer reviews every change. See [Pull requests](docs/src/content/docs/contribute/pull-requests.md) for review, merge and release details.

## License

Nod is licensed under the [Apache License 2.0](LICENSE). Contributions you submit are licensed under the same terms, as section 5 of the license describes.

# Contributing

Thanks for helping. This repository holds the client side of Agent Identity: the TypeScript SDK, the MCP server, the editor plugins and examples. The hosted service is closed source, so changes here are about how clients talk to it.

## Before you start

- **Bugs and small fixes:** open a pull request directly.
- **New features or changes to how the SDK behaves:** open an issue first so we can agree on the shape. A feature the service does not support yet cannot be merged.
- **Questions:** use Discussions, not issues.

## Setup

You need Node 20 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

The tests need no account and no network: they run against a replaced `fetch`. Do not add tests that call the live service.

## Making a change

1. Fork, branch from `main`.
2. Keep the SDK free of runtime dependencies. Zero is a feature.
3. Add or update a test for any behaviour you change, and a line in the package's `CHANGELOG.md` under an "Unreleased" heading.
4. Run `pnpm build && pnpm test && pnpm lint` and make sure all pass.
5. Open the pull request and describe what changed and why.

## Style

- TypeScript, strict. No `any`.
- Public methods and types have a short comment saying what they do, written for the person reading autocomplete.
- Keep changes focused. Unrelated formatting changes make reviews harder.

## Commit and release

Maintainers handle releases. Version numbers follow semver: a breaking change to a public type or method needs a major version, and we avoid them.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

By contributing you agree your contribution is licensed under the [MIT licence](LICENSE).

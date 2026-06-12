# ubctl

Official command-line interface for [Unbroker Cloud](https://github.com/unbroker-app). Talk to the Unbroker API from your terminal and CI: deploy apps, manage services and env vars, and drive your cloud resources programmatically.

> **Status:** early scaffold. Authentication and resource commands land in follow-up PRs (see [#169](https://github.com/unbroker-app/unbroker/issues/169)).

## Install

> Published builds are not available yet. For now, run from source (below).

```bash
# npm (coming soon)
npm install -g ubctl

# standalone binary (coming soon)
curl -fsSL https://github.com/unbroker-app/ubctl/releases/latest/download/install.sh | sh
```

## Quick start

```bash
ubctl login                          # authenticate with an Unbroker API token
ubctl whoami                         # show the authenticated account and active org
ubctl apps projects ls               # list your projects
ubctl apps services ls               # list your services
ubctl apps deploy <serviceId> --wait # trigger a deployment and follow it to completion
```

### Apps commands

```
ubctl apps projects ls | get <id> | create --name <name> | rename <id> --name <name> | rm <id>
ubctl apps services ls | get <id> | create <projectId> --name --repo --framework [...] | rm <id> | logs <id> | metrics <id>
ubctl apps env ls <serviceId> | set <serviceId> <KEY> <VALUE> | rm <serviceId> <KEY>
ubctl apps domains ls <serviceId> | add <serviceId> <hostname> | rm <serviceId> <hostname>
ubctl apps deploy <serviceId> [--wait] | deployments <serviceId> | deployment <id> [--log] | rollback <serviceId> <deploymentId>
```

Add `--json` to any read command for machine-readable output.

### Account commands

```
ubctl tokens ls | create --name <name> [--scope read|read/write] | rm <id>
ubctl account usage | invoices | activity
ubctl orgs
```

`tokens create` prints the secret **once** — store it immediately.

`login` validates the token against the API and stores it (with the API URL and
your org) under `~/.config/ubctl/config.json`, written `0600`. The token can also
come from `--token`, piped stdin (`echo $TOKEN | ubctl login --stdin`), or the
`UBCTL_TOKEN` environment variable. The API base URL defaults to the development
cloud (`https://dev.api.cloud.unbroker.app`); override it with `--api-url` or
`UBCTL_API_URL`.

Global flags:

| Flag             | Description                                       |
| ---------------- | ------------------------------------------------- |
| `--org <id>`     | Act against a specific organization (`X-Org-Id`). |
| `--api-url <url>`| Override the Unbroker API base URL.               |
| `--json`         | Output raw JSON instead of formatted tables.      |
| `-v, --version`  | Print the CLI version.                            |

## Development

Requires [Bun](https://bun.sh) 1.0+.

```bash
bun install         # install dependencies
bun run dev -- --help   # run the CLI from source
bun run test        # run tests
bun run lint        # lint
bun run check-types # type check
bun run build       # bundle to dist/index.js
```

## License

UNLICENSED — Unbroker, all rights reserved.

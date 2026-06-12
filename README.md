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
ubctl login                 # authenticate with an Unbroker API token
ubctl whoami                # show the authenticated account and active org
ubctl apps services ls      # list your services (coming soon)
ubctl apps deploy <service> # trigger a deployment (coming soon)
```

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

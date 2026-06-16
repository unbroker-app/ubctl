# ubctl

Official command-line interface for [Unbroker Cloud](https://github.com/unbroker-app). Talk to the Unbroker API from your terminal and CI: deploy apps, manage services and env vars, and drive your cloud resources programmatically.

📖 **Visual walkthrough of the whole flow:** open [`docs/index.html`](docs/index.html) in a browser (self-contained, no build needed).

## Install

ubctl ships as a scoped npm package on **GitHub Packages** and as standalone
binaries on each GitHub Release. Both live in this **private** repo, so you need
read access (a `gh` login, or a `GITHUB_TOKEN` that can read `unbroker-app/ubctl`).

### Standalone binary (Linux / macOS, x64 / arm64)

```bash
# requires the GitHub CLI (gh auth login) or GITHUB_TOKEN
curl -fsSL https://raw.githubusercontent.com/unbroker-app/ubctl/main/scripts/install.sh | bash
```

### npm (GitHub Packages)

```bash
# one-time: point the @unbroker-app scope at GitHub Packages and authenticate
echo "@unbroker-app:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

npm install -g @unbroker-app/ubctl   # installs the `ubctl` binary
```

Releases are cut by pushing a `vX.Y.Z` tag; CI publishes the package and attaches
the binaries (see `.github/workflows/release.yml`).

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
ubctl apps projects deploy-all <id> | manifest <id> [--values] | import --file <path> [--name <n>] | duplicate <id> --name <n>
ubctl apps projects env ls <projectId> | set <projectId> <KEY> <VALUE> | rm <projectId> <KEY>
ubctl apps services ls | get <id> | create <projectId> --name --repo --framework [...] | update <id> [...] | rm <id> | logs <id> | metrics <id>
ubctl apps services security <id> --mode public|password|organization [--password <pw>]
ubctl apps env ls <serviceId> | set <serviceId> <KEY> <VALUE> | rm <serviceId> <KEY>
ubctl apps domains ls <serviceId> | add <serviceId> <hostname> | rm <serviceId> <hostname>
ubctl apps deploy <serviceId> [--wait] | deployments <serviceId> | deployment <id> [--log] | rollback <serviceId> <deploymentId>
```

Add `--json` to any read command for machine-readable output.

### Beacon (realtime pub/sub)

```
ubctl beacon ls | get <id> | create --name <name> | rm <id>
ubctl beacon enable <id> | disable <id> | token <id> | usage <id>
ubctl beacon channels <id> [--q <filter>] | channel <id> --channel <name>
ubctl beacon publish <id> --channel <name> --data <json>
ubctl beacon settings get <id> | set <id> [--origin <o> ...] [--anon-subscribe <p> ...] [--allow-anonymous|--disallow-anonymous]
```

### GitHub integration

```
ubctl github installations ls | rm <id>
ubctl github repos
ubctl github branches --installation <id> --owner <owner> --repo <repo>
```

Connecting a new installation is a browser OAuth flow — do it in the web
dashboard; the CLI reads what's already connected (pass the installation id to
`apps services create --github-installation` once it's listed here).

### Account commands

```
ubctl tokens ls | create --name <name> [--scope read|read/write] | rm <id>
ubctl account usage | invoices | activity | bandwidth | alerts
ubctl orgs                                  # list
ubctl orgs get <id> | billing <id> | connection <id>
ubctl team ls | invite <email> [--role Owner|Admin|Member|Deploy] | rm <id>
ubctl team invitations ls | rm <id>
ubctl notifications ls | read [id] | unread <id>
```

`tokens create` prints the secret **once** — store it immediately.

Creating/renaming/deleting organizations, editing billing, connecting a cloud
provider and toggling anomaly alerts require a signed-in web session, so they
live in the dashboard — an API token can read these but not change them.

### Cloud resources (DigitalOcean reseller)

```
ubctl droplets ls | get <id> | reboot <id> | power-off <id> | power-on <id> | rm <id>
ubctl db ls | get <id> | create --name --engine --version --region --size [--nodes --storage --tag ...] | rm <id>
ubctl db connection <id> | metrics <id>
ubctl db users ls <id> | create <id> <name> | rm <id> <name>
ubctl db dbs ls <id> | create <id> <name> | rm <id> <name>
ubctl k8s ls | get <id> | kubeconfig <id> | rm <id>
ubctl firewalls ls | get <id> | rm <id>
ubctl lb
ubctl vpcs
ubctl spaces
```

`k8s kubeconfig <id>` prints YAML — redirect it: `ubctl k8s kubeconfig <id> > kubeconfig.yaml`.

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

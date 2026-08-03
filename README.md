# ubctl

The official command-line interface for [Unbroker Cloud](https://github.com/unbroker-app).
Drive your whole account from the terminal or CI: deploy apps from GitHub, manage
services, env vars and domains, spin up managed databases, run Beacon realtime
projects, and inspect your cloud resources — all over the Unbroker API.

It's the same idea as `doctl` or the Fly/Render CLIs, but for Unbroker.

📖 **Prefer a visual tour first?** Open [`docs/index.html`](docs/index.html) in a
browser (self-contained, no build needed).

---

## Contents

- [Install](#install)
- [Authenticate](#authenticate)
- [Core concepts](#core-concepts)
- [Walkthrough 1 — deploy an app from GitHub](#walkthrough-1--deploy-an-app-from-github)
- [Walkthrough 2 — a managed database](#walkthrough-2--a-managed-database)
- [Walkthrough 3 — a Beacon realtime project](#walkthrough-3--a-beacon-realtime-project)
- [Output & scripting](#output--scripting)
- [Configuration](#configuration)
- [Command reference](#command-reference)
- [What lives in the dashboard only](#what-lives-in-the-dashboard-only)
- [Development](#development)

---

## Install

ubctl ships as standalone binaries on each public GitHub Release and as a
scoped npm package on **GitHub Packages**. The standalone installer requires no
GitHub account or access token.

**Standalone binary** (Linux / macOS, x64 / arm64) — no Node required:

```bash
curl -fsSL https://raw.githubusercontent.com/unbroker-app/ubctl/main/scripts/install.sh | bash
```

**npm** (GitHub Packages; GitHub authentication is still required):

```bash
# one-time: point the @unbroker-app scope at GitHub Packages and authenticate
echo "@unbroker-app:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

npm install -g @unbroker-app/ubctl   # installs the `ubctl` binary
```

Verify it:

```bash
ubctl --version
ubctl --help
```

---

## Authenticate

Every command (except `login`/`logout`) talks to the API with an **API token**.

1. Create a token. If you already have one (from the web dashboard → *API
   tokens*), skip to step 2. Otherwise, once you're logged in you can mint more:

   ```bash
   ubctl tokens create --name "my-laptop" --scope read/write
   # → prints the secret ONCE. Copy it now — it's never shown again.
   ```

2. Log in. This validates the token against the API and stores it locally:

   ```bash
   ubctl login                          # prompts for the token (input hidden)
   # non-interactive alternatives:
   ubctl login --token ub_xxx           # pass it directly
   echo "$UB_TOKEN" | ubctl login --stdin   # pipe it (best for CI)
   ```

3. Confirm who you are and which organization is active:

   ```bash
   ubctl whoami
   ```

The token (plus API URL and active org) is written to
`~/.config/ubctl/config.json` with `0600` permissions. To sign out:

```bash
ubctl logout                            # removes the token, keeps api-url & org
```

**Token scopes:** `read` (read-only) or `read/write` (full control, the default).
A `read` token can list and inspect everything but can't create, change or delete.

**In CI**, skip `login` entirely and pass the token by environment variable:

```bash
export UBCTL_TOKEN=ub_xxx
ubctl apps deploy <serviceId> --wait
```

---

## Core concepts

| Concept          | What it is                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| **Organization** | The tenant everything belongs to. You have a personal one plus any teams.  |
| **Project**      | A group of services that share project-wide env vars.                      |
| **Service**      | One deployable unit — a GitHub repo (built for you) or a prebuilt image.   |
| **Deployment**   | One build+release of a service. You can follow it live and roll back.      |
| **Database**     | A managed cluster (Postgres, MySQL, Redis, …) with users & logical DBs.    |
| **Beacon**       | A realtime pub/sub project — channels you publish to and subscribe from.   |

Most resources are scoped to the **active organization**. Override per command
with `--org <id>` (see [`ubctl orgs`](#account--organizations) for the ids).

---

## Walkthrough 1 — deploy an app from GitHub

End to end: project → service → env var → deploy → custom domain.

```bash
# 1. Create a project to hold the service
ubctl apps projects create --name "store"
# → Created project store (prj_123), slug store

# 2. Create a service from a public GitHub repo
ubctl apps services create prj_123 \
  --name web \
  --repo https://github.com/acme/store \
  --framework next \
  --branch main
# → Created service web (svc_456). URL: https://web-store.unbroker.cloud

# (Private repo? connect it in the dashboard, then:
#  ubctl github installations ls   → grab the id
#  ubctl apps services create ... --github-installation 12345)

# 3. Set an environment variable (creates or updates)
ubctl apps env set svc_456 DATABASE_URL "postgres://…"

# 4. Deploy and watch it to completion
ubctl apps deploy svc_456 --wait
#   queued…
#   building…
#   deploying…
#   live
# Deployment dep_789 → live (42s)

# 5. Inspect, tail logs, see live metrics
ubctl apps services get svc_456
ubctl apps services logs svc_456
ubctl apps services metrics svc_456

# 6. Add a custom domain (then point its DNS at Unbroker)
ubctl apps domains add svc_456 store.example.com

# 7. Roll back if a deploy goes wrong
ubctl apps deployments svc_456            # list past deployments
ubctl apps rollback svc_456 dep_111       # re-point live to a known-good one
```

**Project-wide env vars** are shared by every service in the project:

```bash
ubctl apps projects env set prj_123 LOG_LEVEL info
ubctl apps projects env ls prj_123
```

**Move a whole project** between accounts or environments with the portable
manifest:

```bash
ubctl apps projects manifest prj_123 > store.json        # export (secrets redacted)
ubctl apps projects manifest prj_123 --values > store.json   # include secret values
ubctl apps projects import --file store.json --name "store-staging"
ubctl apps projects duplicate prj_123 --name "store-copy" # clone within the org
ubctl apps projects deploy-all prj_123                    # deploy every service, in order
```

---

## Walkthrough 2 — a managed database

```bash
# 1. Provision a Postgres 16 cluster
ubctl db create \
  --name orders-db \
  --engine pg \
  --engine-version 16 \
  --region nyc3 \
  --size db-s-1vcpu-1gb \
  --nodes 1
# → Provisioning database orders-db (db_321). status: provisioning

# 2. Watch it come up
ubctl db ls
ubctl db get db_321

# 3. Grab connection credentials (always printed as JSON — it has secrets)
ubctl db connection db_321
# { "uri": "postgres://…", "host": "…", "port": 25060, "ssl": true, … }

# 4. Manage users and logical databases
ubctl db users create db_321 app_user
ubctl db users ls db_321
ubctl db dbs create db_321 analytics
ubctl db dbs ls db_321

# 5. Point a service at it
ubctl apps env set svc_456 DATABASE_URL "$(ubctl db connection db_321 --json | jq -r .uri)"

# 6. Health at a glance
ubctl db metrics db_321
```

Engines: `pg`, `mysql`, `redis`, `valkey`, `mongodb`, `kafka`, `opensearch`.

---

## Walkthrough 3 — a Beacon realtime project

Beacon is Unbroker's realtime pub/sub. Create a project, allow a browser origin,
then publish and inspect channels.

```bash
# 1. Create and activate a project
ubctl beacon create --name "live-dashboard"
# → Created beacon project live-dashboard (bcn_77). publicKey: pk_…
ubctl beacon enable bcn_77

# 2. Allow your web app's origin and keyless (anonymous) browser access
ubctl beacon settings set bcn_77 \
  --origin https://app.example.com \
  --allow-anonymous \
  --anon-subscribe "public.*"
ubctl beacon settings get bcn_77

# 3. Publish a value and inspect channels
ubctl beacon publish bcn_77 --channel "public.prices" --data '{"BTC": 68000}'
ubctl beacon channels bcn_77                       # list channels + subscriber counts
ubctl beacon channel bcn_77 --channel public.prices  # one channel + its last value

# 4. Mint a short-lived test token for a "try it now" client
ubctl beacon token bcn_77

# 5. See usage (messages, bytes, connections, estimated cost)
ubctl beacon usage bcn_77
```

`settings set` only changes the flags you pass — it reads the current settings
first and overrides the rest, so you can tweak one thing at a time.

---

## Output & scripting

- Read commands print **formatted tables** by default. Add `--json` for raw JSON
  you can pipe into `jq`:

  ```bash
  ubctl apps services ls --json | jq -r '.[].url'
  ```

- Anything carrying **credentials** (`db connection`, `beacon channel`) is always
  emitted as JSON and never tabulated.

- ubctl exits **non-zero** on failure and prints a one-line error (no stack
  trace), so `set -e` scripts and CI fail cleanly. `deploy --wait` exits non-zero
  if the deployment fails.

---

## Configuration

Resolution order for every setting (highest precedence first):

1. CLI flag (`--api-url`, `--org`)
2. Environment variable (`UBCTL_*`)
3. The saved config file (`~/.config/ubctl/config.json`, mode `0600`)
4. Built-in default

| Setting  | Flag             | Env var          | Default                                  |
| -------- | ---------------- | ---------------- | ---------------------------------------- |
| Token    | *(set by login)* | `UBCTL_TOKEN`    | —                                        |
| API URL  | `--api-url`      | `UBCTL_API_URL`  | `https://api.unbroker.cloud`             |
| Org      | `--org`          | `UBCTL_ORG`      | your default (personal) organization     |

The token is deliberately **not** a flag — that keeps it out of your shell
history and `ps` output. Use `login`, `UBCTL_TOKEN`, or stdin.

**Global flags** (work on any command):

| Flag              | Description                                       |
| ----------------- | ------------------------------------------------- |
| `--org <id>`      | Act against a specific organization (`X-Org-Id`). |
| `--api-url <url>` | Override the Unbroker API base URL.               |
| `--json`          | Output raw JSON instead of formatted tables.      |
| `-v, --version`   | Print the CLI version.                            |
| `-h, --help`      | Help for any command or subcommand.               |

Run `ubctl <command> --help` (e.g. `ubctl apps services create --help`) for the
full option list of anything below.

---

## Command reference

### Apps

```
ubctl apps projects ls | get <id> | create --name <name> | rename <id> --name <name> | rm <id>
ubctl apps projects deploy-all <id> | manifest <id> [--values] | import --file <path> [--name <n>] | duplicate <id> --name <n>
ubctl apps projects env ls <projectId> | set <projectId> <KEY> <VALUE> | rm <projectId> <KEY>
ubctl apps services ls | get <id> | create <projectId> --name --repo --framework [--branch --port --build --start --output-dir --root-dir --github-installation]
ubctl apps services update <id> [--name --branch --framework --port --build --start --image-ref --auto-deploy true|false]
ubctl apps services security <id> --mode public|password|organization [--password <pw>]
ubctl apps services rm <id> | logs <id> | metrics <id>
ubctl apps env ls <serviceId> | set <serviceId> <KEY> <VALUE> | rm <serviceId> <KEY>
ubctl apps domains ls <serviceId> | add <serviceId> <hostname> | rm <serviceId> <hostname>
ubctl apps deploy <serviceId> [--wait] [--timeout <s>] | deployments <serviceId> | deployment <id> [--log] | rollback <serviceId> <deploymentId>
```

Frameworks: `next`, `astro`, `node`, `react`, `vue`, `vite`, `static`.

### Beacon (realtime pub/sub)

```
ubctl beacon ls | get <id> | create --name <name> | rm <id>
ubctl beacon enable <id> | disable <id> | token <id> | usage <id>
ubctl beacon channels <id> [--q <filter>] | channel <id> --channel <name>
ubctl beacon publish <id> --channel <name> --data <json>
ubctl beacon settings get <id> | set <id> [--origin <o> ...] [--anon-subscribe <p> ...] [--allow-anonymous | --disallow-anonymous]
```

### Databases (managed clusters)

```
ubctl db ls | get <id> | create --name --engine --engine-version --region --size [--nodes --storage --price --tag ...] | rm <id>
ubctl db connection <id> | metrics <id>
ubctl db users ls <id> | create <id> <name> | rm <id> <name>
ubctl db dbs ls <id> | create <id> <name> | rm <id> <name>
```

### GitHub integration

```
ubctl github installations ls | rm <id>
ubctl github repos
ubctl github branches --installation <id> --owner <owner> --repo <repo>
```

Connecting a new installation is a browser OAuth flow — do it in the dashboard;
the CLI reads what's already connected. Pass the id to
`apps services create --github-installation <id>` to deploy private repos.

### Account & organizations

```
ubctl tokens ls | create --name <name> [--scope read|read/write] | rm <id>
ubctl account usage | invoices | activity | bandwidth | alerts
ubctl orgs                                   # list orgs you belong to
ubctl orgs get <id> | billing <id>
ubctl team ls | invite <email> [--role Owner|Admin|Member|Deploy] | rm <id>
ubctl team invitations ls | rm <id>
ubctl notifications ls | read [id] | unread <id>
```

### Cloud resources

```
ubctl droplets ls | get <id> | reboot <id> | power-off <id> | power-on <id> | rm <id>
ubctl db ls | get <id> | connection <id> | metrics <id> | rm <id>
```

---

## What lives in the dashboard only

An API token authenticates as your *organization*, not as a signed-in *user*, so
a few user-level actions can't be done from the CLI and return `401` if attempted.
Do these in the web dashboard:

- Creating, renaming or deleting organizations
- Editing billing details and managing payment methods
- Connecting/disconnecting a cloud provider (DigitalOcean) token
- Toggling anomaly alerts
- Accepting a team invitation, and the GitHub OAuth connect flow

The CLI can still **read** all of these (`orgs billing`, `orgs connection`,
`account alerts`, …).

---

## Development

Requires [Bun](https://bun.sh) 1.0+.

```bash
bun install              # install dependencies
bun run dev -- --help    # run the CLI from source
bun run test             # run tests (node:test)
bun run lint             # eslint
bun run check-types      # tsc --noEmit
bun run build            # bundle to dist/index.js
```

Releases are cut by pushing a `vX.Y.Z` tag; CI publishes the npm package and
attaches the Linux/macOS binaries (see `.github/workflows/release.yml`).

## License

UNLICENSED — Unbroker, all rights reserved.

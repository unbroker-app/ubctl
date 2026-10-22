# ubctl

The official command-line interface for [Unbroker Cloud](https://github.com/unbroker-app).
Drive your whole account from the terminal or CI: deploy apps from GitHub, manage
services, env vars and domains, scale services, read traffic analytics and
resource usage, spin up managed databases, run Beacon realtime projects, and
inspect your servers — all over the Unbroker API. The standalone binary also
includes an interactive terminal dashboard (`ubctl tui`).

It's the same idea as `doctl` or the Fly/Render CLIs, but for Unbroker.

📖 **Prefer a visual tour first?** Open [`docs/index.html`](docs/index.html) in a
browser (self-contained, no build needed).

---

## Contents

- [Install](#install)
- [Authenticate](#authenticate)
- [Interactive dashboard](#interactive-dashboard)
- [Interactive commands](#interactive-commands)
- [Observability and billing](#observability-and-billing)
- [Core concepts](#core-concepts)
- [Walkthrough 1 — deploy an app from GitHub](#walkthrough-1--deploy-an-app-from-github)
- [Infrastructure as Code](#infrastructure-as-code)
- [Walkthrough 2 — a managed database](#walkthrough-2--a-managed-database)
- [Walkthrough 3 — a Beacon realtime project](#walkthrough-3--a-beacon-realtime-project)
- [Walkthrough 4 — traffic, resources and scale](#walkthrough-4--traffic-resources-and-scale)
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

**Standalone binary** (Linux / macOS, x64 / arm64) — no Node required, and the
only build that includes the interactive dashboard:

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

1. Create a token. If you already have one (from the web dashboard → _API
   tokens_), skip to step 2. Otherwise, once you're logged in you can mint more:

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

   On success, interactive output includes a compact welcome panel with the
   authenticated identity, active organization, API endpoint, config path and
   useful next commands:

   ```text
   ╭──────────────────────────────────────────╮
   │ UNBROKER CLOUD                           │
   │ ✓ Authenticated                          │
   ├──────────────────────────────────────────┤
   │ Identity  API token "my-laptop"          │
   │ Org       my-organization                │
   │ API       https://api.unbroker.cloud     │
   │ Config    ~/.config/ubctl/config.json    │
   ├──────────────────────────────────────────┤
   │ Next: ubctl apps projects ls             │
   │ Help: ubctl --help                       │
   ╰──────────────────────────────────────────╯
   ```

   Use global `--json` when another program consumes the login result:

   ```bash
   echo "$UB_TOKEN" | ubctl --json login --stdin
   ```

3. Confirm who you are and which organization is active:

   ```bash
   ubctl whoami
   ```

To connect more than one account, name each one during login and switch safely:

```bash
ubctl login --context personal
ubctl login --context work
ubctl auth ls
ubctl auth switch personal
```

Each context stores its own API URL, organization, and token in the same
owner-only config file. Always use `login --context <name>` when adding another
account. A plain `login` reauthenticates the selected context and refuses a
token from a different organization, preventing accidental account replacement.

Confirm the selected account after every switch:

```bash
ubctl auth ls
ubctl auth switch work
ubctl whoami
```

Environment variables have higher precedence than contexts. If `UBCTL_TOKEN`,
`UBCTL_ORG`, or `UBCTL_API_URL` is set, it overrides the saved account for that
process. `ubctl doctor` shows the effective configuration without printing the
token.

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

## Interactive dashboard

The standalone binary includes a full-screen terminal dashboard built with
[OpenTUI](https://github.com/anomalyco/opentui). Open it with `ubctl tui` (alias
`ubctl ui`); a bare `ubctl` in an interactive terminal opens it too once you are
logged in. Scripts and pipes keep getting plain output.

```
  ▲ UNBROKER CLOUD ubctl 0.5.0                                        token "ci" · org_acme · acme
                       Analytics · All projects ·    24h    7d    30d    3m    12m
 │ 1 Overview
 │ 2 Services         ╭───────────────────────────────────────────────────────────────────────────╮
 │ 3 Analytics        │ Visitors       Page views     Requests        Online now     Errors       │
 │ 4 Resources        │ 7.4k           24.8k          91.2k           23             0.2%         │
 │ 5 Cloud            │                                                              2.6% 4xx     │
 │ 6 Account          │ p95 latency                           Bandwidth                           │
                      │ 142ms                                 870 MB                              │
                      ╰───────────────────────────────────────────────────────────────────────────╯

                      ╭─ Requests · last 24 hours ────────────────────────────────────────────────╮
                      │ 1.6k      ▁ ▂▆█▂▃▃                     ▄▁▄▆▇                       ▃▇▂▃▄▄ │
                      │          ▃█▅██████▂▁                 ▂▇██████▇▆                 ▄█▆██████ │
                      │         ▄███████████▇▅             ▅████████████▂▁           ▁ ▅█████████ │
                      │        ▇██████████████▄▂        ▃▁████████████████▇         ▂█▆██████████ │
                      │        ██████████████████▃  ▂  ▅███████████████████▅▄▃▄  ▂▃▄█████████████ │
                      │        ███████████████████▇██▅█████████████████████████▅█████████████████ │
                      │ 0      ██████████████████████████████████████████████████████████████████ │
                      ╰──────────────────────────────────────────── 15 min buckets · c to switch ─╯

                      ╭─ Hostnames ───────────────────────╮ ╭─ Pages · page ────────────────────╮
                      │ shop.acme.com   ██████████ 61k    │ │ /               ██████████ 60%    │
  p scope  [ ] range  c chart series  b breakdowns  ctrl+p commands  ? help  q quit
```

| Section   | What you get                                                                  |
| --------- | ----------------------------------------------------------------------------- |
| Overview  | Projects, service health, 24h visitors/requests/5xx, recent activity          |
| Services  | Every service by project; open one for Overview, Resources, Deployments, Logs |
| Analytics | Visitors, page views, errors, p95, request chart, pages/referrers/countries   |
| Resources | Configured scale and live CPU/memory of every service, account usage          |
| Cloud     | Managed databases (with metrics) and servers                                  |
| Account   | Current billing cycle and invoices                                            |

Keys: `ctrl+p` command palette (go to, open service, refresh, switch saved
context, quit) · `1`-`6`/`tab` sections · `esc` back · `r` refresh (auto every
15s) · `PgUp`/`PgDn` scroll · `?` help · `q` quit. On a service: `←`/`→` tabs, `s` scale editor, `d`
deploy, `x` start/stop, `a` analytics for that service. In analytics: `p` scope
(organization, production/preview, project or service), `[`/`]` range, `c` chart
series, `b` breakdown dimensions. Writes (deploy, stop, scale) always ask first or
need an explicit key in the scale editor.

The npm package runs on Node, which OpenTUI does not support; `ubctl tui` there
explains how to get the binary.

## Interactive commands

In the standalone binary, regular commands also help when a person is at the
terminal. Nothing changes for scripts: prompts only appear when stdin and
stdout are terminals, `--json` is off, `CI` is unset and ubctl is the
terminal's foreground job (not `cmd &`). Otherwise a missing argument fails
exactly as before.

| Command | Interactive behavior |
| ------- | -------------------- |
| `ubctl apps deploy` | With `--wait`, or when you pick the service from the list, follows the deployment live: the build log streams above a footer with stages and elapsed time. `q` stops following (with `--wait` that exits non-zero), `ctrl+c` exits 130; the deployment keeps running either way. `ubctl apps deploy <id>` alone still queues and returns. |
| `ubctl apps services create` | With missing flags, asks for project, repository (connected GitHub repos first, with their branches), name and framework, then offers to deploy. |
| `ubctl apps scale <id>` | With no flags, opens the dashboard's scale editor inline; `shift+d` saves and follows the deploy. |
| `ubctl auth switch` | Pick a saved context from a list. |
| Omitted ids | `apps deploy`, `apps deployments`, `apps scale`, `apps services get/logs/metrics/resources/enable/disable`, `db get/metrics/health/resize` let you pick from a list. |

Lists filter as you type; `↑`/`↓` move, `enter` selects and `esc` cancels
(exit code 130). Destructive commands such as `rm` always require an explicit
id. Tables color statuses in a terminal; set `NO_COLOR=1` to turn that off.

## Observability and billing

`ubctl` includes live and historical service metrics, retained runtime logs,
DNS/TLS status, itemized usage, budgets, monitoring policies, uptime checks,
privacy-preserving CLI usage analytics, named contexts, request tracing, safe
retries, diagnostics, and shell completion. See the complete
[observability and operations guide](docs/OBSERVABILITY.md).

## Agent skill

The repository includes an Agent Skills-compatible `ubctl-ops` skill for Codex,
Claude Code, and other agents that support the open `SKILL.md` format. Codex
discovers it from `.agents/skills/ubctl-ops`; Claude Code discovers the same
skill through `.claude/skills/ubctl-ops`. Agents that do not auto-discover skills
can follow the pointer in `AGENTS.md` or read the canonical `SKILL.md` directly.

Ask the agent to use `ubctl` or invoke the skill explicitly (`$ubctl-ops` in
Codex or `/ubctl-ops` in Claude Code). The skill teaches resource discovery,
safe authentication, JSON automation, deployment verification, and secret-aware
operations while treating the installed command's `--help` as the current source
of truth.

## Core concepts

| Concept          | What it is                                                                |
| ---------------- | ------------------------------------------------------------------------- |
| **Organization** | The tenant everything belongs to. You have a personal one plus any teams. |
| **Project**      | A group of services that share project-wide env vars.                     |
| **Service**      | One deployable unit — a GitHub repo (built for you) or a prebuilt image.  |
| **Deployment**   | One build+release of a service. You can follow it live and roll back.     |
| **Database**     | A managed cluster (`ubctl db`) or a self-hosted Apps service (`ubctl apps databases`). |
| **Beacon**       | A realtime pub/sub project — channels you publish to and subscribe from.  |

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
ubctl apps services resources svc_456 --range 1h

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

### Self-hosted databases and persistent volumes

Self-hosted databases run inside Apps as private image services. The template
creates the official database image, its persistent volume, and a generated
password in one operation:

```bash
# Supported engines: postgres, redis, mongodb, mysql
ubctl apps databases create prj_123 \
  --name orders-db \
  --engine postgres \
  --volume-size 10

# Save the one-time credential output, then deploy the database
ubctl apps deploy svc_db123 --wait
ubctl apps databases ls
ubctl apps databases connection svc_db123

# Connect a local client through an authenticated encrypted tunnel.
# Omit --port to let ubctl select a free local port.
ubctl apps databases tunnel svc_db123 --port 5432
```

Persistent storage is also available to regular app services. Volumes cannot
be detached or shrunk after provisioning; deleting the service removes its
volume and data.

```bash
ubctl apps volumes attach svc_456 --path /app/data --size 10
ubctl apps volumes resize svc_456 --size 20
ubctl apps volumes ls

# Or attach storage while creating a repo service:
ubctl apps services create prj_123 --name worker \
  --repo https://github.com/acme/worker --framework node \
  --volume-path /app/data --volume-size 10
```

Volume backups use an S3-compatible destination:

```bash
export UBCTL_S3_ACCESS_KEY="..."
export UBCTL_S3_SECRET_KEY="..."
ubctl apps backups destinations create --name primary \
  --endpoint https://s3.example.com --region us-east-1 --bucket app-backups \
  --prefix unbroker
ubctl apps backups schedule svc_db123 --destination dst_123 \
  --cron "0 3 * * *" --retain 7
ubctl apps backups run svc_db123
ubctl apps backups ls svc_db123
ubctl apps backups restore svc_db123 backup_123 --confirm orders-db
```

---

## Infrastructure as Code

Define a complete project environment in `.unbroker/unbroker.ts` with the
`@unbroker/iac` authoring SDK:

```bash
ubctl config init
ubctl config pull prj_123 --force
ubctl config plan prj_123 --out .unbroker/production.plan.json
ubctl config apply prj_123 --plan .unbroker/production.plan.json --yes
```

Plans are immutable and fail if the live environment drifts before apply.
Destructive changes require `--confirm-destructive` in addition to `--yes`.

---

## Walkthrough 2 — a managed database

```bash
# 1. Provision a Postgres 16 cluster
ubctl db create \
  --name orders-db \
  --engine pg \
  --engine-version 16 \
  --region <region> \
  --size <node-size> \
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
ubctl db health db_321          # connections, size and schema findings (PostgreSQL)

# 7. Scale it in place (the cluster stays online while it migrates)
ubctl db resize db_321 --size <node-size> --nodes 2
```

Engines: `pg`, `mysql`, `redis`, `valkey`, `mongodb`, `kafka`, `opensearch`.
Use the region and node-size slugs offered in Cloud → Databases → New.

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

## Walkthrough 4 — traffic, resources and scale

Traffic analytics are measured at your cell's ingress, so they need no client
script. Scanner probes are excluded from the totals.

```bash
# 1. How is the storefront doing? (default range: last 24 hours)
ubctl analytics --project prj_123
ubctl analytics --service svc_456 --range 7d       # 30d, 3m and 12m also work
ubctl analytics --env preview                       # only preview environments

# 2. Where does the traffic come from?
ubctl analytics top pages --service svc_456
ubctl analytics top referrers --range 30d --limit 20
ubctl analytics top country --json | jq -r '.rows[] | "\(.value) \(.requests)"'

# 3. Is it running hot? Configured scale, live usage per pod, history
ubctl apps services resources svc_456 --range 6h
ubctl apps resources --project prj_123              # every service at once

# 4. Scale it: autoscale 2-5 replicas at 70% CPU, 1 GiB per replica
ubctl apps scale svc_456 --autoscale --min 2 --max 5 --target-cpu 70 \
  --memory 1024 --dry-run                           # check first
ubctl apps scale svc_456 --autoscale --min 2 --max 5 --target-cpu 70 \
  --memory 1024 --deploy --wait                     # save and roll out
```

Scale changes are saved immediately and take effect on the next deployment;
`--deploy` starts that deployment for you. `--cpu default` / `--memory default`
return to the platform defaults. The CLI checks your tier's replica ceiling (3 on
the shared tier) and `min ≤ max` before sending anything. Scheduled pre-warm
windows (`--window …`) are available on dedicated cells.

Plan notes: traffic beyond 24 hours, every `analytics top` breakdown, live
resource usage and scaling require the Pro plan. Without it the commands return
the API's `subscription_required` message (resources still show the configured
scale).

---

## Output & scripting

- Read commands print **formatted tables** by default. Add `--json` for raw JSON
  you can pipe into `jq`:

  ```bash
  ubctl apps services ls --json | jq -r '.[].url'
  ```

- Anything carrying **credentials** (`db connection`, `beacon channel`) is always
  emitted as JSON and never tabulated.

- Backup destination credentials can be supplied through
  `UBCTL_S3_ACCESS_KEY` and `UBCTL_S3_SECRET_KEY`, keeping them out of shell
  history. Creation responses never echo those secrets.

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

| Setting | Flag             | Env var         | Default                              |
| ------- | ---------------- | --------------- | ------------------------------------ |
| Token   | _(set by login)_ | `UBCTL_TOKEN`   | —                                    |
| API URL | `--api-url`      | `UBCTL_API_URL` | `https://api.unbroker.cloud`         |
| Org     | `--org`          | `UBCTL_ORG`     | your default (personal) organization |

The token is deliberately **not** a flag — that keeps it out of your shell
history and `ps` output. Use `login`, `UBCTL_TOKEN`, or stdin.

Named contexts are selected with `ubctl auth switch <name>`. They participate at
the saved-config level of this precedence order; flags and environment variables
still override the selected context for a single process.

**Global flags** (work on any command):

| Flag                  | Description                                       |
| --------------------- | ------------------------------------------------- |
| `--org <id>`          | Act against a specific organization (`X-Org-Id`). |
| `--api-url <url>`     | Override the Unbroker API base URL.               |
| `--json`              | Output raw JSON instead of formatted tables.      |
| `--output text\|json` | Select the output format explicitly.              |
| `--trace`             | Print safe request status and timing diagnostics. |
| `--retries <count>`   | Retry rate limits and safe transient reads.       |
| `-v, --version`       | Print the CLI version.                            |
| `-h, --help`          | Help for any command or subcommand.               |

Run `ubctl <command> --help` (e.g. `ubctl apps services create --help`) for the
full option list of anything below.

---

## Command reference

### Apps

```
ubctl apps projects ls | get <id> | create --name <name> | rename <id> --name <name> | rm <id>
ubctl apps projects deploy-all <id> | manifest <id> [--values] | import --file <path> [--name <n>] | duplicate <id> --name <n>
ubctl apps projects env ls <projectId> | set <projectId> <KEY> <VALUE> | rm <projectId> <KEY>
ubctl apps services ls | get <id> | create <projectId> --name --repo --framework [--branch --port --build --start --output-dir --root-dir --github-installation --volume-path --volume-size]
ubctl apps services update <id> [--name --branch --framework --port --build --start --image-ref --volume-size --auto-deploy true|false]
ubctl apps services security <id> --mode public|password|organization [--password <pw>]
ubctl apps services rm <id> | logs <id> [--since <duration>] | metrics <id> [--since <duration>]
ubctl apps services resources <id> [--range 15m|1h|6h|24h|7d|30d] | apps resources [--project <id>]
ubctl apps scale <id> [--replicas <n>] [--cpu <m>|default] [--memory <Mi>|default] [--autoscale|--no-autoscale --min --max --target-cpu --target-memory]
                      [--window|--no-window --window-min --window-start --window-end --window-days --window-tz] [--deploy [--wait]] [--dry-run]
ubctl apps databases ls | get <id> | create <projectId> --name --engine postgres|redis|mongodb|mysql [--volume-size <gb>]
ubctl apps databases connection <id> | tunnel <id> [--port <local-port>]
ubctl apps volumes ls | attach <serviceId> --path <absolute-path> --size <gb> | resize <serviceId> --size <gb>
ubctl apps backups ls <serviceId> | schedule <serviceId> --destination <id> --cron <expr> [--retain <n>] | run <serviceId> | restore <serviceId> <backupId> --confirm <serviceName>
ubctl apps backups destinations ls | create --name --endpoint --region --bucket [--prefix --access-key --secret-key] | rm <id>
ubctl apps env ls <serviceId> | set <serviceId> <KEY> <VALUE> | rm <serviceId> <KEY>
ubctl apps domains ls <serviceId> | status <serviceId> | add <serviceId> <hostname> | rm <serviceId> <hostname>
ubctl apps deploy <serviceId> [--wait] [--timeout <s>] | deployments <serviceId> | deployment <id> [--log] | cancel <deploymentId> | rollback <serviceId> <deploymentId>
```

`ubctl apps services scale` is the same command as `ubctl apps scale`.

Frameworks: `next`, `astro`, `node`, `react`, `vue`, `vite`, `static`.

Database image services run on private cluster nodes. Connect from a local
database client without downloading a separate tunnel script:

```bash
ubctl apps services connection <service-id>
ubctl apps services tunnel <service-id> --port 5432
# `connect` is an alias for `tunnel`; omit --port to choose a free local port.
```

Connect project nodes by assigning a provider output to an environment variable
on the consumer service. References resolve securely during deployment:

```bash
# Service → service
ubctl apps connect <consumer-service-id> --service <provider-service-id> --source-output url --env API_URL

# Database image service → service (secure composite URI, as in the UI)
ubctl apps connect <consumer-service-id> --service <database-service-id> --source-output connection --env DATABASE_URL

# Managed database → service
ubctl apps connect <consumer-service-id> --database <database-id> --source-output uri --env DATABASE_URL

# Beacon → service
ubctl apps connect <consumer-service-id> --beacon <beacon-id> --source-output secret --env BEACON_SECRET

ubctl apps connections <consumer-service-id>
ubctl apps disconnect <consumer-service-id> DATABASE_URL
```

### Analytics

```
ubctl analytics [overview] [--service <id> | --project <id> | --env production|preview] [--range 24h|7d|30d|90d|365d] [--host <hostname>]
ubctl analytics top <dimension> [scope flags] [--range …] [--limit 1-100]
```

Dimensions: `page`, `path`, `referer` (`referrers`), `country`, `device`,
`browser`, `os`, `status`, `method`, `bot`, `utm_source`, `utm_medium`,
`utm_campaign`, `protocol`, `scheme`, `tls`, `cache`. Range aliases: `3m`, `12m`.

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
ubctl db connection <id> | metrics <id> | health <id>
ubctl db resize <id> --size <slug> --nodes <n> [--storage <gb>]
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
ubctl account usage [--breakdown] [--month YYYY-MM] | charges | invoices | activity | bandwidth | alerts | cli-usage [--days 30]
ubctl billing budget get | set --amount <usd> [--thresholds 50,80,100] | rm
ubctl monitoring ls | alert-create --name --service --metric --compare --value [--window] | uptime-create --name --url | check <id> | rm <id>
ubctl login [--context <name>] | auth ls | save <name> | switch <name> | rm <name>
ubctl doctor [--json] | completion bash|zsh|fish
ubctl orgs                                   # list orgs you belong to
ubctl orgs get <id> | billing <id>
ubctl team ls | invite <email> [--role Owner|Admin|Member|Deploy] | rm <id>
ubctl team invitations ls | rm <id>
ubctl notifications ls | read [id] | unread <id>
```

### Servers

```
ubctl servers ls | get <id> | reboot <id> | power-off <id> | power-on <id> | rm <id>
```

`ubctl droplets` remains an alias of `ubctl servers` for existing scripts.

### Interactive dashboard

```
ubctl tui            # alias: ubctl ui; a bare `ubctl` in a terminal opens it when logged in
```

---

## What lives in the dashboard only

An API token authenticates as your _organization_, not as a signed-in _user_, so
a few user-level actions can't be done from the CLI and return `401` if attempted.
Do these in the web dashboard:

- Creating, renaming or deleting organizations
- Editing billing details and managing payment methods
- Toggling anomaly alerts
- Accepting a team invitation, and the GitHub OAuth connect flow

The CLI can still **read** these (`orgs billing`, `account alerts`, …).

---

## Development

Requires [Bun](https://bun.sh) 1.0+.

```bash
bun install              # install dependencies
bun run dev -- --help    # run the CLI from source
bun run dev:tui          # run the interactive dashboard from source
bun run test             # run CLI tests (node:test)
bun run test:tui         # run dashboard interaction tests (bun test)
bun run lint             # eslint
bun run check-types      # tsc --noEmit
bun run build            # bundle to dist/index.js (Node, without the dashboard)
bun run build:binary     # standalone binary for this machine in out/ubctl
```

The dashboard lives in `src/tui` (OpenTUI + Solid). It follows the opencode TUI
layout: providers for theme, API session, routes, dialogs and toasts; a command
palette; and per-route keybindings published to the footer. Tests render it
headlessly against canned API responses (`src/tui/testing/fixtures.ts`).

Releases are cut by pushing a `vX.Y.Z` tag; CI publishes the npm package and
attaches the Linux/macOS binaries (see `.github/workflows/release.yml`). The
binaries are cross-compiled with `bun scripts/build.ts --compile=all` after
`bun install --os="*" --cpu="*"`, which fetches OpenTUI's native renderer for
every target.

## License

UNLICENSED — Unbroker, all rights reserved.

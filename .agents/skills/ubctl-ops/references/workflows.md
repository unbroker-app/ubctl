# ubctl workflow reference

These are representative patterns, not a substitute for the installed CLI's
help. Run the corresponding `--help` command before using optional flags or when
the installed version differs.

## Inspect before changing

```bash
ubctl whoami
ubctl doctor
ubctl orgs
ubctl apps projects ls --json
ubctl apps services ls --json
```

Use JSON IDs from the list response in subsequent commands. If selecting by name,
fail on zero or multiple matches rather than silently choosing one.

## Deploy an application

```bash
ubctl apps projects create --name store

ubctl apps services create prj_123 \
  --name web \
  --repo https://github.com/acme/store \
  --framework next \
  --branch main

ubctl apps env set svc_456 LOG_LEVEL info
ubctl apps deploy svc_456 --wait
ubctl apps services get svc_456
ubctl apps services logs svc_456 --since 30m
ubctl apps services metrics svc_456 --since 1h
```

Supported framework choices and create options can change; inspect
`ubctl apps services create --help`. A private repository requires an existing
dashboard OAuth connection; list it with `ubctl github installations ls` and pass
the installation ID when creating the service.

## Domains and deployment recovery

```bash
ubctl apps domains add svc_456 store.example.com
ubctl apps domains status svc_456

ubctl apps deployments svc_456 --json
ubctl apps rollback svc_456 dep_111
ubctl apps services get svc_456
```

Adding a domain does not configure external DNS. Report the DNS/TLS status and
the remaining DNS action. Resolve and verify the known-good deployment before a
rollback.

## Project manifests

```bash
ubctl apps projects manifest prj_123 > store.json
ubctl apps projects import --file store.json --name store-staging
ubctl apps projects deploy-all prj_123
```

Manifest exports redact secret values by default. `--values` includes them and
therefore requires sensitive-file handling; do not use it unless the user
explicitly needs a secret-bearing export.

## Self-hosted database service

```bash
ubctl apps databases create prj_123 \
  --name orders-db \
  --engine postgres \
  --volume-size 10

ubctl apps deploy svc_db123 --wait
ubctl apps databases connection svc_db123
ubctl apps databases tunnel svc_db123 --port 5432
```

Connection output is secret. Do not reproduce it. If `--port` is omitted, ubctl
can select a free local port. Tunnels are long-running processes; only start one
when the user needs the active connection, and stop it when the task is done.

## Managed database cluster

```bash
ubctl db create \
  --name orders \
  --engine pg \
  --engine-version 16 \
  --region fra1 \
  --size db-s-1vcpu-1gb

ubctl db get db_321
ubctl db users create db_321 app_user
ubctl db dbs create db_321 analytics
ubctl db metrics db_321
```

Never invent engine, version, region, or size values. Obtain valid choices from
the user's requirements, prior resource data, or command help/API output.

## Connect application resources

```bash
ubctl apps connect svc_consumer \
  --service svc_provider \
  --source-output url \
  --env API_URL

ubctl apps connect svc_consumer \
  --database db_321 \
  --source-output uri \
  --env DATABASE_URL

ubctl apps connections svc_consumer
```

References resolve during deployment. Deploy the consumer when the task requires
the new binding to take effect.

## Beacon realtime project

```bash
ubctl beacon create --name live-dashboard
ubctl beacon enable bcn_77
ubctl beacon settings set bcn_77 \
  --origin https://example.com \
  --anon-subscribe 'public.*' \
  --allow-anonymous
ubctl beacon publish bcn_77 \
  --channel public.prices \
  --data '{"BTC":68000}'
ubctl beacon usage bcn_77
```

Validate publish data as JSON. Treat `ubctl beacon token` and channel data that
contains credentials as sensitive. Anonymous access changes should match a clear
user request and use the narrowest origin and channel patterns practical.

## Billing and monitoring

```bash
ubctl account usage --month 2026-08 --breakdown --json
ubctl account charges --json
ubctl billing budget get --json
ubctl monitoring ls --json
ubctl apps services metrics svc_456 --since 1h --json
ubctl apps services logs svc_456 --since 30m
```

Use `YYYY-MM` for billing months and duration strings supported by the installed
command. Separate observed data from inference when diagnosing an incident.

## Robust shell automation

```bash
set -euo pipefail

service_id="$({ ubctl apps services ls --json; } | jq -er \
  '[.[] | select(.name == "web")] | if length == 1 then .[0].id else error("expected exactly one service named web") end')"

ubctl apps deploy "$service_id" --wait
```

Quote IDs and user-supplied values. Avoid shell tracing around secrets. ubctl
returns non-zero on errors, and `deploy --wait` returns non-zero when deployment
fails, so preserve exit statuses in CI.

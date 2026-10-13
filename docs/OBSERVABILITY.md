# Observability, billing, and CLI operations

## Service metrics and logs

```bash
ubctl apps services metrics <serviceId>
ubctl apps services metrics <serviceId> --since 1h
ubctl apps services logs <serviceId> --since 30m
```

`--since` accepts durations (`30s`, `15m`, `2h`, `7d`), ISO timestamps, or
epoch milliseconds. Historical service data is retained by the control plane
for seven days. JSON output preserves the complete API response. Live pod rows
show the pod name, container state (for example `CrashLoopBackOff`), CPU,
memory and restarts; CPU and memory are `-` until the metrics server has a
sample.

## Resources and scale

```bash
ubctl apps services resources <serviceId>              # scale, limits, live usage per pod
ubctl apps services resources <serviceId> --range 24h  # plus CPU/memory/network history
ubctl apps resources [--project <projectId>]           # every service + account totals
ubctl apps scale <serviceId> --replicas 3 --memory 1024
ubctl apps scale <serviceId> --autoscale --min 2 --max 5 --target-cpu 70 --deploy --wait
```

Usage is shown against the per-replica limits actually applied to the running
pods. Live usage needs the Pro plan; without it the commands still print the
configured scale. Scale changes are saved immediately and apply on the next
deployment (`--deploy` starts it). `--dry-run` validates without saving.

## Traffic analytics

```bash
ubctl analytics                                     # organization, last 24 hours
ubctl analytics --project <projectId> --range 30d   # 7d, 30d, 3m (90d), 12m (365d)
ubctl analytics --service <serviceId> --host shop.example.com
ubctl analytics --env preview
ubctl analytics top pages --range 7d --limit 20
ubctl analytics top referrers --json
```

Totals come from the cell's ingress: visitors (unique clients), page views,
requests, visitors online in the last five minutes, 4xx/5xx rates, p95 latency
and bandwidth, plus a request timeline and top hostnames. Scanner probes are
excluded from the totals and reported separately. Visitor counts read `n/a`
when the ingress does not see client IPs. Ranges beyond 24 hours and every
`top` breakdown require the Pro plan.

## Domains and TLS

```bash
ubctl apps domains ls <serviceId>
ubctl apps domains status <serviceId>
```

The status command reports default-host TLS readiness and every custom domain's
status and required CNAME target.

## Usage and billing

```bash
ubctl account usage
ubctl account usage --breakdown
ubctl account usage --month 2026-08 --breakdown
ubctl account charges
ubctl account invoices

ubctl billing budget get
ubctl billing budget set --amount 200 --thresholds 50,80,100
ubctl billing budget rm
```

Billing reads require `billing:read`; budget changes require `billing:manage`.

## Monitoring policies

```bash
ubctl monitoring alert-create \
  --name "CPU high" \
  --service <serviceId> \
  --metric cpu \
  --compare above \
  --value 80 \
  --window 5

ubctl monitoring uptime-create \
  --name "Production" \
  --url https://app.example.com

ubctl monitoring ls
ubctl monitoring check <policyId>
ubctl monitoring rm <policyId>
```

Metric windows use the average of retained samples. Supported metrics are
`cpu`, `memory`, `restarts`, `unhealthy`, and `ready_percent`. Policies run every
minute and create organization notifications on alert and recovery transitions.

Uptime checks accept HTTPS URLs belonging to a default service hostname or an
active custom domain in the same organization. Arbitrary URLs, IP literals,
localhost, and internal hostnames are rejected to prevent SSRF.

## CLI usage analytics

```bash
ubctl account cli-usage --days 30
```

The official client sends only its semantic version. The API aggregates:

- organization, UTC day, and CLI version;
- HTTP method and Fastify route template;
- HTTP status class, request count, error count, and total latency.

It never stores command arguments, resource IDs, raw URLs, bodies, query
values, tokens, headers, IP addresses, repository names, or environment values.

## Reliability and diagnostics

```bash
ubctl --trace --retries 5 account usage
ubctl doctor
ubctl completion zsh
```

Retries apply to HTTP 429 responses and to 5xx responses for safe GET requests.
Mutations are never retried after a 5xx response because the server may already
have committed them. Trace output contains method, route, status, retry number,
and timing; it never prints headers or bodies.

## Named contexts

```bash
ubctl login --context personal
ubctl login --context production
ubctl auth ls
ubctl auth switch personal
ubctl auth rm production
```

Use `login --context <name>` when adding an account. A plain `login`
reauthenticates the selected context and refuses to replace it with a token from
a different organization. This prevents the previously selected account from
being overwritten before it can be saved under a new name.

Contexts live in the existing owner-only (`0600`) config file. Logging out also
removes the active context's saved token, so switching cannot restore a token
that was explicitly cleared.

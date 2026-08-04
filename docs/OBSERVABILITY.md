# Observability, billing, and CLI operations

## Service metrics and logs

```bash
ubctl apps services metrics <serviceId>
ubctl apps services metrics <serviceId> --since 1h
ubctl apps services logs <serviceId> --since 30m
```

`--since` accepts durations (`30s`, `15m`, `2h`, `7d`), ISO timestamps, or
epoch milliseconds. Historical service data is retained by the control plane
for seven days. JSON output preserves the complete API response.

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
ubctl auth save personal
ubctl auth save production
ubctl auth ls
ubctl auth switch personal
ubctl auth rm production
```

Contexts live in the existing owner-only (`0600`) config file. Logging out also
removes the active context's saved token, so switching cannot restore a token
that was explicitly cleared.

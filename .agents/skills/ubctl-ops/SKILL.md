---
name: ubctl-ops
description: "Operate Unbroker Cloud safely with the ubctl CLI: authenticate, inspect accounts and resources, deploy apps, manage databases and Beacon, configure domains and environment variables, troubleshoot failures, and automate commands in CI. Use whenever a task mentions ubctl, Unbroker Cloud, or managing Unbroker resources from a terminal or agent."
metadata:
  author: unbroker-app
  version: "1.0"
---

# Operate Unbroker Cloud with ubctl

Use the local `ubctl` executable instead of constructing HTTP requests to the
Unbroker API. Prefer the installed command's help over remembered syntax because
the CLI can evolve independently of this skill.

This skill requires the `ubctl` executable and network access to an Unbroker API.
`jq` is optional for shell automation.

## Establish context

1. Run `ubctl --version` and `ubctl --help` when availability or syntax is
   uncertain. If the binary is missing, explain that and use the installation
   instructions in the repository `README.md`; do not install it unless the user
   asked for setup or the task clearly requires installation.
2. Before an account-scoped operation, run `ubctl whoami`. When authentication or
   configuration is unclear, run `ubctl doctor`; it reports effective settings
   without printing the token.
3. Confirm the active organization before writes. Use `--org <id>` for an
   intentional one-command override. Environment variables override saved named
   contexts, so inspect relevant `UBCTL_*` variable names when the result is
   surprising, but never print their secret values.
4. Discover exact syntax with the narrowest applicable help command, such as
   `ubctl apps services create --help`.

## Execute safely

- Start with list/get/status commands to resolve human names to exact IDs and to
  understand current state. Do not guess resource IDs, organization IDs, regions,
  engine versions, sizes, or deployment IDs.
- Read-only inspection is safe when it advances the user's request. Create,
  update, deploy, invite, publish, switch-context, or delete only when the request
  authorizes that change.
- Before deletion, rollback, restore, power-off, token revocation, or another
  difficult-to-reverse action, state the exact target and preserve any CLI
  confirmation guard. Do not bypass a required `--confirm` value.
- After a write, query the resulting resource or status and report its ID and
  observable outcome. For deployments, use `--wait` when the requested outcome
  depends on reaching a terminal state; a failed wait exits non-zero.
- Use `--json` when parsing output. Do not scrape formatted tables. Check the exit
  status before trusting stdout, and use `jq -e` when a missing field should fail
  the workflow.
- Prefer environment variables or stdin for secrets. Never echo tokens,
  passwords, connection URIs, Beacon secrets, or S3 credentials into chat, logs,
  command arguments, or committed files. Treat JSON from connection and channel
  commands as sensitive even though the CLI intentionally emits it as JSON.
- Use `--trace` only for diagnostics; it reports safe request metadata. Keep
  retries at their default unless the task calls for a different retry policy.

## Authentication and CI

- Interactive setup: `ubctl login`, then `ubctl whoami`.
- Non-interactive login: pipe a token to `ubctl login --stdin`; avoid
  `login --token` in automation because arguments may enter shell history or
  process listings.
- CI normally sets `UBCTL_TOKEN` and skips `login`. Also set `UBCTL_ORG` when the
  token can access multiple organizations.
- For multiple accounts, use named contexts with `ubctl login --context <name>`,
  `ubctl auth ls`, and `ubctl auth switch <name>`, then verify with `whoami`.
- Never expose `~/.config/ubctl/config.json`; it contains credentials and should
  remain owner-readable only.

## Choose the command family

- `apps`: projects, services, deployments, env vars, domains, volumes, backups,
  self-hosted database services, connections, logs, and metrics.
- `db`: managed database clusters, database users, logical databases,
  connections, and metrics.
- `beacon`: realtime projects, access settings, channels, publishing, tokens,
  and usage.
- `github`: connected installations, repositories, and branches. New GitHub OAuth
  connections are completed in the dashboard.
- `account`, `billing`, and `monitoring`: usage, charges, invoices, budgets,
  alerts, and uptime checks.
- `orgs`, `team`, `notifications`, `tokens`, and `auth`: account administration.
- Cloud resource families such as `droplets`: infrastructure exposed through the
  Unbroker reseller layer. Use root and subcommand help to discover what the
  installed CLI supports.

For representative workflows and scripting patterns, read
[references/workflows.md](references/workflows.md). For the complete current
surface, use `ubctl --help`, `ubctl <family> --help`, and the repository
`README.md` when available.

## Report results

Summarize the command outcome, resource name and ID, active organization, and any
next action that remains. Redact secrets as `[REDACTED]`. On failure, include the
concise CLI error and the diagnostic command or corrective action tried; do not
claim success from partial output.

# ubctl QA audit

Audit started: 2026-08-03

This document records the initial validation and the remediation completed on
2026-08-03. Findings are resolved on the QA fix branches and covered by
regression tests; merge and post-deploy verification are tracked in the PRs.

## v0.4.0 operations validation

Completed on 2026-08-04 after API PR
[unbroker-cloud#577](https://github.com/unbroker-app/unbroker-cloud/pull/577)
and CLI PR [ubctl#14](https://github.com/unbroker-app/ubctl/pull/14) were merged.

- Backend: 715 tests, full workspace type check and lint passed locally; GitHub
  CI type check, lint, and the eight-minute test job passed.
- CLI: 63 tests, type check, lint, production bundle, PR CI, and `main` CI
  passed.
- Release: v0.4.0 package and four standalone binaries published; the installed
  macOS arm64 binary matched the release SHA-256 checksum.
- Production reads: diagnostics, current charges, monthly usage breakdown,
  historical metrics and logs, DNS/TLS status, monitoring list, budgets, and
  privacy-safe CLI usage aggregation passed.
- Production mutations: one temporary metric policy, one temporary owned-domain
  uptime policy, and one temporary budget were created, read/evaluated, deleted,
  and checked absent. No service, deployment, database, VM, or other
  infrastructure was created or changed.
- Review fixes: private-address DNS protection for uptime checks, atomic
  transition notifications across API replicas, authorization for manual
  checks, and no automatic 5xx retries for CLI mutations.
- Privacy verification: CLI usage contains only version, route template,
  method, status class, counts, errors, and latency. Trace output was checked for
  token/header leakage and contained none.

## Scope

- Static checks, unit tests, type checking, linting, and production build.
- Complete command registration, help, options, validation, and exit behavior.
- Read-only calls against `https://api.unbroker.cloud` using the active org.
- Mutating and failure-path E2E flows against an isolated local mock API.
- No creation, deletion, deployment, or billable action in the live account.

## Findings

### UBCTL-QA-001 — `whoami` reports a demo identity for a real account

- Severity: High
- Status: Resolved (CLI compatibility + API identity contract)
- Area: API identity / `login` / `whoami`
- Environment: production API, org `unbroker-mkt`, CLI `v0.1.0`

Reproduction:

```console
$ ubctl whoami
Account: Demo User <demo@unbroker.cloud>
Org:     Unbroker Mkt (unbroker-mkt)
API:     https://api.unbroker.cloud
```

Both authenticated endpoints return the placeholder identity:

```text
GET /profile -> profile.id=demo, name=Demo User, email=demo@unbroker.cloud
GET /account -> account.uuid=demo, name=Demo User, email=demo@unbroker.cloud
```

The active token is a real `read/write` token named `ubctl-tbor`, and the API
correctly resolves its organization as `unbroker-mkt`. This indicates an API
identity-resolution problem or an API contract mismatch: organization API
tokens may not represent a signed-in user, while `whoami` presents the returned
placeholder as the personal account.

Expected behavior:

- Return and display the real token owner, if API tokens have user identity; or
- Clearly display an organization/service identity without claiming that the
  placeholder is the user's personal account.

### UBCTL-QA-002 — Documented cloud commands call missing production routes

- Severity: High
- Status: Resolved (unsupported and potentially unsafe commands removed)
- Area: reseller resources / API compatibility
- Environment: production API, org `unbroker-mkt`, CLI `v0.1.0`

The following read-only commands exit with status `1` and only print
`ubctl: Not Found`:

```text
ubctl k8s ls --json
ubctl firewalls ls --json
ubctl lb --json
ubctl vpcs --json
ubctl spaces --json
ubctl orgs connection unbroker-mkt --json
```

Expected behavior:

- The documented API routes exist and return an empty collection or connection
  state when the organization has no corresponding resources; or
- Unsupported commands are not shipped/documented until the API implements
  them.
- Errors include enough context (status/code/path) to distinguish a missing
  route from a missing resource or disconnected provider.

### UBCTL-QA-003 — `db create --version` exits without creating anything

- Severity: Critical
- Status: Resolved (`--engine-version`; v0.1 spelling remains compatible)
- Area: databases / Commander option inheritance
- Environment: CLI `v0.1.0`, reproduced without touching the live API

`db create` defines a required engine option named `--version`, while the root
program already defines `--version` for the CLI version. The root option wins:

```console
$ ubctl db create --name test --engine pg --version 16 --region test1 --size small
0.1.0
$ echo $?
0
```

No HTTP request is sent. This creates a false-success condition in scripts and
makes database provisioning through the CLI impossible.

Expected behavior:

- Rename the database option (for example `--engine-version`), or otherwise
  scope it so it cannot collide with the root CLI version option.
- Add a command-action regression test that asserts the POST body and endpoint.

### UBCTL-QA-004 — Invalid numeric service values are sent as JSON `null`

- Severity: High
- Status: Resolved (validated numeric option parsers)
- Area: apps services input validation
- Environment: isolated mock API, CLI `v0.1.0`

Both service creation and update accept a nonnumeric port and exit successfully:

```text
--port abc -> Number("abc") -> NaN -> JSON null
```

Observed request bodies:

```json
{ "port": null }
```

Service creation also accepts a repository value that is not a URL. Numeric
values and repository URLs should be validated before any HTTP request.

### UBCTL-QA-005 — Mutually dependent or contradictory security flags are accepted

- Severity: Medium
- Status: Resolved (pre-request validation)
- Area: service security / Beacon settings validation
- Environment: isolated mock API, CLI `v0.1.0`

Observed cases:

- `--mode password` succeeds without `--password`.
- `--mode public --password value` sends the irrelevant password.
- `--allow-anonymous --disallow-anonymous` succeeds and silently chooses
  `allowAnonymous: true`.

Expected behavior: reject contradictory flags and enforce/omit passwords based
on the selected access mode before contacting the API.

### UBCTL-QA-006 — Deployment timeout accepts invalid values

- Severity: High
- Status: Resolved (finite positive decimal parser)
- Area: deployment polling input validation
- Environment: isolated mock API, CLI `v0.1.0`

`ubctl apps deploy svc --wait --timeout abc` is accepted. `Number("abc")`
becomes `NaN`, so the calculated deadline is also `NaN`. A deployment that does
not immediately reach a terminal state may poll indefinitely because the
deadline comparison can never become true.

Expected behavior: require a finite positive numeric timeout before triggering
the deployment.

### UBCTL-QA-007 — API errors lose the server's useful message

- Severity: Medium
- Status: Resolved (both API error envelopes supported)
- Area: API client error parsing
- Environment: production API, CLI `v0.1.0`

The production API's framework-level 404 envelope is shaped like:

```json
{
  "message": "Route GET:/spaces not found",
  "error": "Not Found",
  "statusCode": 404
}
```

The client only understands `{ "error": { "code", "message" } }`, so all six
missing routes collapse to the unhelpful `ubctl: Not Found`. The error parser
should support both envelopes and preserve HTTP status, API code, and message.

### UBCTL-QA-008 — The visual documentation contains stale private-install and API information

- Severity: Medium
- Status: Resolved
- Area: `docs/index.html`
- Environment: repository `main`

The self-contained visual guide still says:

- The repository is private and installation needs `gh`/`GITHUB_TOKEN`.
- The default API is `https://dev.api.cloud.unbroker.app`, which is obsolete.
- The footer labels the project as private.

README and the actual CLI use the public repository/install flow and
`https://api.unbroker.cloud`.

### UBCTL-QA-009 — Automated command tests register commands but rarely execute actions

- Severity: High
- Status: Resolved (action-level E2E coverage across every command family)
- Area: test coverage / regression safety
- Environment: repository `main`

The built-in suite passes 40 tests and reports 77.42% line coverage, but command
function coverage is commonly only 17–45%. Most tests assert that commands and
subcommands exist; they do not execute them or verify HTTP method/path/body,
output, or exit status. This allowed the critical `db create --version`
collision and invalid numeric serialization to ship.

Expected behavior: add action-level tests with an injected/local API for every
resource family, plus explicit tests for option collisions and validation.

### UBCTL-QA-010 — Existing config permissions are not tightened before storing a token

- Severity: High
- Status: Resolved (owner-only atomic replacement)
- Area: credential storage
- Environment: macOS, CLI `v0.1.0`

The file mode passed to `writeFileSync` only applies when creating a new file.
If `config.json` already exists with permissive permissions, login preserves
them:

```text
before login: 0644
after login:  0644
after logout: 0644
```

This can expose the saved bearer token to other local users. `saveConfig` and
the logout rewrite should explicitly enforce `0600` on every write, including
existing files, and tests should cover this case.

## Execution log

| Check                         | Result               | Notes                                                                        |
| ----------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| Public install, macOS arm64   | Pass                 | Anonymous download, SHA-256 verification, `ubctl 0.1.0`                      |
| Live authentication           | Partial              | Token and org resolve; see UBCTL-QA-001                                      |
| Unit and integration tests    | Pass                 | 63/63 in CLI v0.4.0; 715/715 in the API                                      |
| TypeScript                    | Pass                 | `tsc --noEmit`                                                               |
| Lint                          | Pass                 | ESLint, zero warnings                                                        |
| Production build              | Pass                 | Bun bundle generated successfully                                            |
| Installer syntax              | Pass                 | `bash -n scripts/install.sh`                                                 |
| Command help                  | Pass                 | All 97 leaf commands return valid help                                       |
| Live top-level reads          | Partial              | 23 exercised: 18 pass, 5 fail; see UBCTL-QA-002                              |
| Live nested reads             | Partial              | 14 exercised: 13 pass, 1 fails; see UBCTL-QA-002                             |
| Human-readable live output    | Pass                 | 30 commands; no `NaN`, `undefined`, invalid dates, or object coercion found  |
| Isolated command-action E2E   | Pass with gaps found | 74 flows; all routed after mock correction; see validation findings          |
| Login/logout E2E              | Pass                 | stdin token, org persistence, config mode `0600`, token removal              |
| Auth/error paths              | Pass                 | missing token, rejected token, login rejection, and network failure exit `1` |
| Test coverage                 | Partial              | 77.42% lines, 60.42% functions; command actions are under-tested             |
| npm package dry run           | Pass                 | Three expected files, executable bundle with shebang                         |
| Version-pinned public install | Pass                 | Anonymous `VERSION=v0.1.0`, checksum and executable verified                 |
| Command aliases               | Pass                 | `notifs` and `team invites`                                                  |

## Intentionally not executed against production

- Mutating commands were exercised against the isolated mock API, not the live
  organization. No project, service, deployment, token, invitation, database,
  VM, cluster, firewall, domain, or notification state was changed in
  production.
- Live database, droplet, Beacon, Kubernetes, and firewall detail commands had
  no safe existing resource to inspect. Their actions and output contracts were
  covered by the mock E2E matrix.

## Audit summary

- Open findings: 0
- Resolved findings: 10
- Critical: 1
- High: 6
- Medium: 3
- Automated suite: 55/55 passing after remediation
- Registered leaf-command help checks: 97/97 passing
- Live read-only invocations: 37
- Human-output invocations: 30
- Isolated command-action E2E invocations: 74

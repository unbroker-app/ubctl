import { Command, Option } from "commander";
import type {
  EnvVarResponse,
  EnvVarsResponse,
  ServiceResponse,
} from "../../api/types";
import { ApiError } from "../../api/client";
import { authed, withJson } from "../helpers";
import { CliError } from "../../util/errors";
import { print, printJson, printTable } from "../../util/output";

const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;
const SERVICE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const RESOURCE_ID_RE = /^[A-Za-z0-9_-]+$/;

const OUTPUTS = {
  service: ["url", "host", "port", "slug"],
  database: ["uri", "host", "port", "database"],
  beacon: ["url", "public_key", "app_id", "secret"],
} as const;

export interface ConnectionOpts {
  env: string;
  output: string;
  service?: string;
  database?: string;
  beacon?: string;
}

/** Build the same deploy-time reference token used by the Apps board UI. */
export function connectionReference(opts: ConnectionOpts): string {
  const selected = (
    ["service", "database", "beacon"] as const
  ).filter((provider) => opts[provider] !== undefined);
  if (selected.length !== 1)
    throw new CliError(
      "Choose exactly one source: --service, --database, or --beacon.",
    );

  const provider = selected[0]!;
  const id = opts[provider]!;
  const idOk =
    provider === "service"
      ? SERVICE_SLUG_RE.test(id)
      : RESOURCE_ID_RE.test(id);
  if (!idOk) throw new CliError(`Invalid ${provider} identifier: ${id}`);

  const output = opts.output;
  if (provider === "service" && output.startsWith("env.")) {
    const sourceKey = output.slice(4);
    if (!ENV_KEY_RE.test(sourceKey))
      throw new CliError(`Invalid source environment key: ${sourceKey}`);
  } else if (!(OUTPUTS[provider] as readonly string[]).includes(output)) {
    throw new CliError(
      `Invalid ${provider} output. Choose: ${OUTPUTS[provider].join(", ")}${provider === "service" ? ", or env.KEY" : ""}.`,
    );
  }

  return `\${{${provider === "service" ? "services" : provider === "database" ? "databases" : "beacons"}.${id}.${output}}}`;
}

export function connectionsCommands(): Command[] {
  const connect = new Command("connect")
    .description("Connect a provider node to a service environment variable")
    .argument("<targetServiceId>", "consumer service id")
    .requiredOption("--env <KEY>", "environment variable on the consumer")
    .requiredOption("--output <output>", "provider output to reference")
    .addOption(
      new Option("--service <id>", "source service id").conflicts([
        "database",
        "beacon",
      ]),
    )
    .addOption(
      new Option("--database <id>", "source managed database id").conflicts([
        "service",
        "beacon",
      ]),
    )
    .addOption(
      new Option("--beacon <id>", "source Beacon id").conflicts([
        "service",
        "database",
      ]),
    )
    .action(
      async (targetServiceId: string, rawOpts: ConnectionOpts, cmd: Command) => {
        const opts = { ...rawOpts, env: rawOpts.env.toUpperCase() };
        if (!ENV_KEY_RE.test(opts.env))
          throw new CliError(
            "Environment keys must use uppercase letters, numbers, and underscores.",
          );
        const { client } = authed(cmd);
        if (opts.service) {
          const { service } = await client.get<ServiceResponse>(
            `/apps/services/${opts.service}`,
          );
          opts.service = service.slug;
        }
        const value = connectionReference(opts);
        try {
          await client.post<EnvVarResponse>(
            `/apps/services/${targetServiceId}/env`,
            { key: opts.env, value },
          );
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          await client.put<EnvVarResponse>(
            `/apps/services/${targetServiceId}/env/${opts.env}`,
            { value },
          );
        }
        print(`Connected ${opts.env} on ${targetServiceId} to ${value}.`);
        print("Redeploy the consumer service to apply.");
      },
    );

  const disconnect = new Command("disconnect")
    .description("Remove a node connection from a service")
    .argument("<targetServiceId>", "consumer service id")
    .argument("<KEY>", "connected environment variable")
    .action(
      async (targetServiceId: string, rawKey: string, _opts, cmd: Command) => {
        const key = rawKey.toUpperCase();
        if (!ENV_KEY_RE.test(key)) throw new CliError(`Invalid environment key: ${rawKey}`);
        const { client } = authed(cmd);
        await client.delete(`/apps/services/${targetServiceId}/env/${key}`);
        print(`Disconnected ${key} from ${targetServiceId}. Redeploy to apply.`);
      },
    );

  const connections = withJson(
    new Command("connections")
      .description("List a service's node connections")
      .argument("<targetServiceId>", "consumer service id")
      .action(async (targetServiceId: string, _opts, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { envVars } = await client.get<EnvVarsResponse>(
          `/apps/services/${targetServiceId}/env`,
        );
        const rows = envVars.filter((item) => item.maskedValue.includes("${{"));
        if (ctx.json) return printJson(rows);
        printTable(rows, [
          { key: "key", header: "variable" },
          { key: "maskedValue", header: "reference" },
        ]);
      }),
  );

  return [connect, disconnect, connections];
}

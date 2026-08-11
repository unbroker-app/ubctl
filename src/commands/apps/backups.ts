import { Command, Option } from "commander";
import type {
  BackupDestination,
  BackupRun,
  BackupSchedule,
} from "../../api/types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";
import { positiveInteger } from "../../util/validate";
import { CliError } from "../../util/errors";
import { age } from "../../util/format";

interface BackupState {
  schedule: BackupSchedule | null;
  runs: BackupRun[];
}

export function backupsCommand(): Command {
  const backups = new Command("backups").description(
    "Back up and restore Apps persistent volumes",
  );

  withJson(
    backups
      .command("ls <serviceId>")
      .description("Show backup schedule and run history")
      .action(async (serviceId: string, _opts, cmd) => {
        const { ctx, client } = authed(cmd);
        const state = await client.get<BackupState>(
          `/apps/services/${serviceId}/backups`,
        );
        if (ctx.json) return printJson(state);
        if (state.schedule)
          print(
            `Schedule: ${state.schedule.enabled ? "enabled" : "disabled"} · ${state.schedule.cron} UTC · keep ${state.schedule.retentionCount}`,
          );
        else print("Schedule: not configured");
        printTable(
          state.runs.map((run) => ({ ...run, created: age(run.createdAt) })),
          [
          { key: "id", header: "id" },
          { key: "operation", header: "operation" },
          { key: "status", header: "status" },
          { key: "engine", header: "engine" },
            { key: "created", header: "created" },
          ],
        );
      }),
  );

  withJson(
    backups
      .command("schedule <serviceId>")
      .description("Create or update an automated backup schedule")
      .requiredOption("--destination <id>", "backup destination id")
      .requiredOption("--cron <expression>", "five-field UTC cron expression")
      .addOption(
        new Option("--retain <count>", "number of backups to retain")
          .argParser((v) => positiveInteger(v, "retention count", 100))
          .default(7),
      )
      .addOption(
        new Option("--enabled <bool>", "enable or pause the schedule")
          .choices(["true", "false"])
          .default("true"),
      )
      .action(
        async (
          serviceId: string,
          opts: {
            destination: string;
            cron: string;
            retain: number;
            enabled: string;
          },
          cmd,
        ) => {
          const { ctx, client } = authed(cmd);
          const { schedule } = await client.put<{
            schedule: BackupSchedule;
          }>(`/apps/services/${serviceId}/backups/schedule`, {
            destinationId: opts.destination,
            cron: opts.cron,
            retentionCount: opts.retain,
            enabled: opts.enabled === "true",
          });
          if (ctx.json) return printJson(schedule);
          print(`Backup schedule saved for ${serviceId}.`);
        },
      ),
  );

  withJson(
    backups
      .command("run <serviceId>")
      .description("Start a backup now")
      .action(async (serviceId: string, _opts, cmd) => {
        const { ctx, client } = authed(cmd);
        const { run } = await client.post<{ run: BackupRun }>(
          `/apps/services/${serviceId}/backups`,
          {},
        );
        if (ctx.json) return printJson(run);
        print(`Backup ${run.id} queued for ${serviceId}.`);
      }),
  );

  withJson(
    backups
      .command("restore <serviceId> <backupId>")
      .description("Restore a successful backup (destructive)")
      .requiredOption("--confirm <serviceName>", "service name confirmation")
      .action(
        async (
          serviceId: string,
          backupId: string,
          opts: { confirm: string },
          cmd,
        ) => {
          const { ctx, client } = authed(cmd);
          const { run } = await client.post<{ run: BackupRun }>(
            `/apps/services/${serviceId}/backups/${backupId}/restore`,
            { confirmation: opts.confirm },
          );
          if (ctx.json) return printJson(run);
          print(`Restore ${run.id} queued for ${serviceId}.`);
        },
      ),
  );

  backups.addCommand(destinationsCommand());
  return backups;
}

function destinationsCommand(): Command {
  const destinations = new Command("destinations").description(
    "Manage S3-compatible backup destinations",
  );

  withJson(
    destinations
      .command("ls")
      .description("List backup destinations")
      .action(async (_opts, cmd) => {
        const { ctx, client } = authed(cmd);
        const { destinations: rows } = await client.get<{
          destinations: BackupDestination[];
        }>("/apps/backup-destinations");
        if (ctx.json) return printJson(rows);
        printTable(rows, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "endpoint", header: "endpoint" },
          { key: "bucket", header: "bucket" },
          { key: "prefix", header: "prefix" },
        ]);
      }),
  );

  withJson(
    destinations
      .command("create")
      .description("Add an S3-compatible backup destination")
      .requiredOption("--name <name>", "destination name")
      .requiredOption("--endpoint <url>", "HTTPS S3 endpoint")
      .requiredOption("--region <region>", "S3 region")
      .requiredOption("--bucket <bucket>", "S3 bucket")
      .option("--prefix <prefix>", "object key prefix", "unbroker")
      .option(
        "--access-key <key>",
        "S3 access key id (or UBCTL_S3_ACCESS_KEY)",
      )
      .option(
        "--secret-key <secret>",
        "S3 secret access key (or UBCTL_S3_SECRET_KEY)",
      )
      .action(
        async (
          opts: {
            name: string;
            endpoint: string;
            region: string;
            bucket: string;
            prefix: string;
            accessKey?: string;
            secretKey?: string;
          },
          cmd,
        ) => {
          const { ctx, client } = authed(cmd);
          const accessKey = opts.accessKey ?? process.env.UBCTL_S3_ACCESS_KEY;
          const secretKey = opts.secretKey ?? process.env.UBCTL_S3_SECRET_KEY;
          if (!accessKey || !secretKey)
            throw new CliError(
              "S3 credentials require --access-key and --secret-key, or UBCTL_S3_ACCESS_KEY and UBCTL_S3_SECRET_KEY.",
            );
          const { destination } = await client.post<{
            destination: BackupDestination;
          }>("/apps/backup-destinations", {
            name: opts.name,
            endpoint: opts.endpoint,
            region: opts.region,
            bucket: opts.bucket,
            prefix: opts.prefix,
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
          });
          if (ctx.json) return printJson(destination);
          print(
            `Created backup destination ${destination.name} (${destination.id}).`,
          );
        },
      ),
  );

  destinations
    .command("rm <id>")
    .description("Delete an unused backup destination")
    .action(async (id: string, _opts, cmd) => {
      const { client } = authed(cmd);
      await client.delete(`/apps/backup-destinations/${id}`);
      print(`Deleted backup destination ${id}.`);
    });
  return destinations;
}

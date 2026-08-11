import { Command, Option } from "commander";
import type { ServiceResponse, ServicesResponse } from "../../api/types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";
import { integerRange, volumePath } from "../../util/validate";

const sizeOption = () =>
  new Option("--size <gb>", "volume size in GiB")
    .argParser((v) => integerRange(v, "volume size", 10, 50))
    .makeOptionMandatory();

export function volumesCommand(): Command {
  const volumes = new Command("volumes").description(
    "Manage Apps persistent volumes",
  );

  withJson(
    volumes
      .command("ls")
      .description("List persistent volumes")
      .action(async (_opts, cmd) => {
        const { ctx, client } = authed(cmd);
        const { services } =
          await client.get<ServicesResponse>("/apps/services");
        const rows = services.filter((service) => service.volumePath != null);
        if (ctx.json) return printJson(rows);
        printTable(rows, [
          { key: "id", header: "service id" },
          { key: "name", header: "service" },
          { key: "volumePath", header: "mount path" },
          { key: "volumeSizeGb", header: "size gb" },
          { key: "status", header: "status" },
        ]);
      }),
  );

  withJson(
    volumes
      .command("attach <serviceId>")
      .description("Attach a new persistent volume to a service")
      .requiredOption("--path <path>", "absolute mount path", volumePath)
      .addOption(sizeOption())
      .action(
        async (
          serviceId: string,
          opts: { path: string; size: number },
          cmd,
        ) => {
          const { ctx, client } = authed(cmd);
          const { service } = await client.patch<ServiceResponse>(
            `/apps/services/${serviceId}`,
            {
              volumePath: opts.path,
              volumeSizeGb: opts.size,
            },
          );
          if (ctx.json) return printJson(service);
          print(
            `Attached ${service.volumeSizeGb} GiB at ${service.volumePath} to ${service.name}.`,
          );
          print(`Deploy it with: ubctl apps deploy ${service.id} --wait`);
        },
      ),
  );

  withJson(
    volumes
      .command("resize <serviceId>")
      .alias("grow")
      .description("Grow an existing persistent volume")
      .addOption(sizeOption())
      .action(async (serviceId: string, opts: { size: number }, cmd) => {
        const { ctx, client } = authed(cmd);
        const { service } = await client.patch<ServiceResponse>(
          `/apps/services/${serviceId}`,
          { volumeSizeGb: opts.size },
        );
        if (ctx.json) return printJson(service);
        print(
          `Volume for ${service.name} will grow to ${service.volumeSizeGb} GiB on the next deploy.`,
        );
      }),
  );

  return volumes;
}

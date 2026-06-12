import { Command } from "commander";
import type {
  ClustersResponse,
  ClusterResponse,
} from "../../api/reseller-types";
import { authed, withJson } from "../helpers";
import { print, printJson, printTable } from "../../util/output";

export function kubernetesCommand(): Command {
  const k8s = new Command("k8s").description("Manage Kubernetes clusters");

  withJson(
    k8s
      .command("ls")
      .description("List clusters")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { clusters } = await client.get<ClustersResponse>(
          "/kubernetes/clusters",
        );
        if (ctx.json) return printJson(clusters);
        printTable(
          clusters.map((c) => ({
            ...c,
            nodes: c.nodePools.reduce((n, p) => n + p.count, 0),
          })),
          [
            { key: "id", header: "id" },
            { key: "name", header: "name" },
            { key: "status", header: "status" },
            { key: "region", header: "region" },
            { key: "version", header: "version" },
            { key: "nodes", header: "nodes" },
          ],
        );
      }),
  );

  withJson(
    k8s
      .command("get <id>")
      .description("Show a cluster")
      .action(async (id: string, _opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { cluster } = await client.get<ClusterResponse>(
          `/kubernetes/clusters/${id}`,
        );
        if (ctx.json) return printJson(cluster);
        print(`id:      ${cluster.id}`);
        print(`name:    ${cluster.name}`);
        print(`status:  ${cluster.status}`);
        print(`region:  ${cluster.region}`);
        print(`version: ${cluster.version}`);
        print("pools:");
        for (const p of cluster.nodePools) {
          print(`  - ${p.name}: ${p.count} × ${p.size}${p.readyNodes != null ? ` (${p.readyNodes} ready)` : ""}`);
        }
      }),
  );

  // kubeconfig is YAML, not JSON — print it raw so it can be redirected to a file.
  k8s
    .command("kubeconfig <id>")
    .description("Print the cluster kubeconfig (YAML)")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      const yaml = await client.get<string>(
        `/kubernetes/clusters/${id}/kubeconfig`,
      );
      process.stdout.write(typeof yaml === "string" ? yaml : String(yaml));
      if (typeof yaml === "string" && !yaml.endsWith("\n")) {
        process.stdout.write("\n");
      }
    });

  k8s
    .command("rm <id>")
    .description("Destroy a cluster")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/kubernetes/clusters/${id}`);
      print(`Destroyed cluster ${id}`);
    });

  return k8s;
}

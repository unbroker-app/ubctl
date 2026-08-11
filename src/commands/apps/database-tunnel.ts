import type { Command } from "commander";
import type { TunnelTicket } from "../../api/types";
import { authed } from "../helpers";
import { print } from "../../util/output";
import { openTunnel } from "../../util/tunnel";

/** Shared action used by both `apps databases tunnel` and the service alias. */
export async function runDatabaseTunnel(
  id: string,
  localPort: number,
  cmd: Command,
): Promise<void> {
  const { client } = authed(cmd);
  const ticket = await client.post<TunnelTicket>(
    `/apps/services/${id}/tunnels`,
    {},
  );
  const tunnel = await openTunnel(ticket, localPort);
  const c = ticket.credentials;
  const auth = c.username
    ? `${encodeURIComponent(c.username)}:${encodeURIComponent(c.password)}@`
    : c.password
      ? `:${encodeURIComponent(c.password)}@`
      : "";
  const database = c.database ? `/${encodeURIComponent(c.database)}` : "";
  const uri = `${c.protocol}://${auth}127.0.0.1:${tunnel.port}${database}`;
  print(`Tunnel ready on 127.0.0.1:${tunnel.port} — press Ctrl+C to stop.`);
  print(`Connection URI: ${uri}`);

  const stop = () => void tunnel.close();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await tunnel.closed;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

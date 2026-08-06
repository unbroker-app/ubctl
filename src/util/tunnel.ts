import net from "node:net";
import { CliError } from "./errors";

const OPEN = 1;
const DATA = 2;
const CLOSE = 3;

export interface TunnelTicket {
  ticket: string;
  url: string;
}

export interface TunnelHandle {
  port: number;
  close(): Promise<void>;
  closed: Promise<void>;
}

/** Open the local half of the Unbroker TCP-over-WebSocket tunnel. */
export async function openTunnel(
  ticket: TunnelTicket,
  localPort: number,
): Promise<TunnelHandle> {
  if (typeof WebSocket === "undefined")
    throw new CliError("Database tunnels require Node.js 22 or newer.");

  const ws = new WebSocket(ticket.url, ["unbroker-tunnel." + ticket.ticket]);
  ws.binaryType = "arraybuffer";
  const locals = new Map<number, net.Socket>();
  let nextId = 1;
  let settled = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => (resolveClosed = resolve));

  const frame = (op: number, id: number, payload = Buffer.alloc(0)) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const header = Buffer.allocUnsafe(5);
    header[0] = op;
    header.writeUInt32BE(id, 1);
    ws.send(Buffer.concat([header, payload]));
  };

  const server = net.createServer((local) => {
    const id = nextId++;
    locals.set(id, local);
    frame(OPEN, id);
    local.on("data", (chunk) => frame(DATA, id, chunk));
    local.on("end", () => frame(CLOSE, id));
    local.on("error", () => frame(CLOSE, id));
    local.on("close", () => locals.delete(id));
  });

  const cleanup = () => {
    for (const local of locals.values()) local.destroy();
    locals.clear();
    if (server.listening) server.close();
    if (!settled) {
      settled = true;
      resolveClosed();
    }
  };

  ws.addEventListener("message", (event) => {
    const data = Buffer.from(event.data as ArrayBuffer);
    if (data.length < 5) return;
    const op = data[0];
    const id = data.readUInt32BE(1);
    const local = locals.get(id);
    if (op === DATA) local?.write(data.subarray(5));
    if (op === CLOSE) local?.destroy();
  });
  ws.addEventListener("close", cleanup);

  await new Promise<void>((resolve, reject) => {
    const fail = (message: string) => {
      cleanup();
      reject(new CliError(message));
    };
    const closedBeforeReady = (event: Event & { reason?: string }) =>
      fail(
        `Tunnel closed before it was ready${event.reason ? `: ${event.reason}` : "."}`,
      );
    ws.addEventListener("close", closedBeforeReady, { once: true });
    ws.addEventListener("error", () => fail("Tunnel connection failed."), {
      once: true,
    });
    ws.addEventListener(
      "open",
      () => {
        ws.removeEventListener("close", closedBeforeReady);
        server.once("error", (error: NodeJS.ErrnoException) => {
          ws.close(1000);
          fail(
            error.code === "EADDRINUSE"
              ? `Local port ${localPort} is already in use.`
              : `Cannot listen on local port ${localPort}: ${error.message}`,
          );
        });
        server.listen(localPort, "127.0.0.1", () => resolve());
      },
      { once: true },
    );
  });

  const address = server.address();
  if (!address || typeof address === "string")
    throw new CliError("Could not determine the local tunnel port.");

  return {
    port: address.port,
    closed,
    close: async () => {
      if (ws.readyState === WebSocket.OPEN) ws.close(1000);
      cleanup();
    },
  };
}

import net from "node:net";
import WebSocket from "ws";
import { CliError } from "./errors";

const OPEN = 1;
const DATA = 2;
const CLOSE = 3;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const MAX_TCP_CONNECTIONS = 20;

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
  const ws = new WebSocket(ticket.url, ["unbroker-tunnel." + ticket.ticket]);
  ws.binaryType = "arraybuffer";
  const locals = new Map<number, net.Socket>();
  let nextId = 1;
  let settled = false;
  let ready = false;
  let expectedClose = false;
  let resolveClosed!: () => void;
  let rejectClosed!: (error: Error) => void;
  const closed = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });

  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    if (error) rejectClosed(error);
    else resolveClosed();
  };

  const frame = (op: number, id: number, payload = Buffer.alloc(0)) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      ws.close(1009, "Tunnel buffer limit reached");
      return;
    }
    const header = Buffer.allocUnsafe(5);
    header[0] = op;
    header.writeUInt32BE(id, 1);
    ws.send(Buffer.concat([header, payload]));
  };

  const server = net.createServer((local) => {
    if (locals.size >= MAX_TCP_CONNECTIONS) {
      local.destroy();
      return;
    }
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
  };

  ws.addEventListener("message", (event) => {
    const data = Buffer.from(event.data as ArrayBuffer);
    if (data.length < 5) {
      ws.close(1003, "Invalid tunnel frame");
      return;
    }
    const op = data[0];
    const id = data.readUInt32BE(1);
    const local = locals.get(id);
    if (op === DATA && local) {
      if (local.writableLength > MAX_BUFFERED_BYTES) {
        ws.close(1009, "Tunnel buffer limit reached");
        return;
      }
      local.write(data.subarray(5));
    } else if (op === CLOSE) local?.destroy();
    else ws.close(1003, "Invalid tunnel frame");
  });
  ws.addEventListener("close", (event) => {
    cleanup();
    if (!ready) return;
    const abnormal = !expectedClose;
    finish(
      abnormal
        ? new CliError(
            `Tunnel closed unexpectedly${event.reason ? `: ${event.reason}` : ` (code ${event.code})`}.`,
          )
        : undefined,
    );
  });
  ws.addEventListener("error", () => {
    if (!ready) return;
    cleanup();
    finish(new CliError("Tunnel connection failed."));
  });

  await new Promise<void>((resolve, reject) => {
    const fail = (message: string) => {
      cleanup();
      reject(new CliError(message));
    };
    const closedBeforeReady = (event: WebSocket.CloseEvent) =>
      fail(
        `Tunnel closed before it was ready${event.reason ? `: ${event.reason}` : "."}`,
      );
    ws.addEventListener("close", closedBeforeReady, { once: true });
    const startupError = () => fail("Tunnel connection failed.");
    ws.addEventListener("error", startupError, { once: true });
    ws.addEventListener(
      "open",
      () => {
        ws.removeEventListener("close", closedBeforeReady);
        server.once("error", (error: NodeJS.ErrnoException) => {
          const cliError = new CliError(
            error.code === "EADDRINUSE"
              ? `Local port ${localPort} is already in use.`
              : `Cannot listen on local port ${localPort}: ${error.message}`,
          );
          expectedClose = true;
          ws.close(1000);
          if (ready) {
            cleanup();
            finish(cliError);
          } else fail(cliError.message);
        });
        server.listen(localPort, "127.0.0.1", () => {
          ready = true;
          ws.removeEventListener("error", startupError);
          resolve();
        });
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
      expectedClose = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000);
        const forceClose = setTimeout(() => ws.terminate(), 1_000);
        forceClose.unref();
      }
      cleanup();
      finish();
    },
  };
}

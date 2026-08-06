import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import { openTunnel } from "./tunnel";

function frame(op: number, id: number, payload = Buffer.alloc(0)): Buffer {
  const header = Buffer.allocUnsafe(5);
  header[0] = op;
  header.writeUInt32BE(id, 1);
  return Buffer.concat([header, payload]);
}

test("tunnel proxies local TCP data over the authenticated WebSocket", async () => {
  const wss = new WebSocketServer({ port: 0 });
  await once(wss, "listening");
  const address = wss.address();
  assert.ok(address && typeof address !== "string");

  wss.on("connection", (socket, request) => {
    assert.equal(
      request.headers["sec-websocket-protocol"],
      "unbroker-tunnel.ticket",
    );
    socket.on("message", (raw) => {
      const data = Buffer.from(raw as Buffer);
      const op = data[0];
      const id = data.readUInt32BE(1);
      if (op === 2) socket.send(frame(2, id, data.subarray(5)));
      if (op === 3) socket.send(frame(3, id));
    });
  });

  const tunnel = await openTunnel(
    { ticket: "ticket", url: `ws://127.0.0.1:${address.port}` },
    0,
  );
  const local = net.createConnection({ host: "127.0.0.1", port: tunnel.port });
  await once(local, "connect");
  local.write("hello");
  const [data] = (await once(local, "data")) as [Buffer];
  assert.equal(data.toString(), "hello");

  local.destroy();
  await tunnel.close();
  await tunnel.closed;
  await new Promise<void>((resolve) => wss.close(() => resolve()));
});

test("tunnel reports an unexpected remote close", async () => {
  const wss = new WebSocketServer({ port: 0 });
  await once(wss, "listening");
  const address = wss.address();
  assert.ok(address && typeof address !== "string");
  wss.once("connection", (socket) =>
    setTimeout(() => socket.close(1011, "setup failed"), 20),
  );

  const tunnel = await openTunnel(
    { ticket: "ticket", url: `ws://127.0.0.1:${address.port}` },
    0,
  );
  await assert.rejects(tunnel.closed, /setup failed/);
  await new Promise<void>((resolve) => wss.close(() => resolve()));
});

import { Command } from "commander";
import { loadConfig } from "../config/store";
import { resolveContext } from "../context";
import { oauthBase, oauthToken } from "../auth/oauth";
import { CliError } from "../util/errors";

/** Streamable HTTP adapter; the remote server remains the tool implementation. */
export async function relayMcp(
  endpoint: string,
  message: unknown,
  authorization: () => Promise<Record<string, string>>,
  fetchFn: typeof fetch = fetch,
) {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      ...(await authorization()),
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify(message),
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok)
    throw new CliError(
      `MCP request rejected (${response.status}); verify the organization, MCP setting and authentication context`,
    );
  if (response.status === 204 || !response.body) return [];
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > 2 * 1024 * 1024)
        throw new CliError("MCP response exceeded the adapter limit");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel();
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return [];
  if (response.headers.get("content-type")?.includes("text/event-stream"))
    return text.split(/\r?\n\r?\n/).flatMap((event) => {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      return data ? [JSON.parse(data) as unknown] : [];
    });
  return [JSON.parse(text) as unknown];
}

export function mcpCommand() {
  const command = new Command("mcp").description(
    "Connect a local MCP client to the remote Unbroker MCP server",
  );
  command
    .command("serve")
    .option(
      "--context <name>",
      "pin the adapter to a saved authentication context",
    )
    .description(
      "Run an authenticated MCP stdio adapter; stdout contains protocol messages only",
    )
    .action(async (options: { context?: string }, cmd: Command) => {
      const config = loadConfig();
      const name = options.context ?? config.currentContext;
      const saved = name ? config.contexts?.[name] : config;
      if (name && !saved) throw new CliError("Unknown authentication context");
      const ctx = options.context
        ? { apiUrl: saved?.apiUrl, token: saved?.token, oauth: saved?.oauth }
        : resolveContext(cmd.optsWithGlobals());
      if (!ctx.apiUrl || !ctx.token)
        throw new CliError(
          "Sign in first with ubctl login --device --mcp --context assistant",
        );
      const base = oauthBase(ctx.apiUrl);
      const oauth = ctx.oauth;
      if (oauth && oauth.resource !== `${base}/mcp`)
        throw new CliError(
          "This OAuth context is for the REST API; create an MCP context with ubctl login --device --mcp --context assistant",
        );
      const authorization = async (): Promise<Record<string, string>> =>
        oauth
          ? { authorization: `Bearer ${await oauthToken(base, name, oauth)}` }
          : { authorization: `Bearer ${ctx.token!}` };
      let buffer = "";
      process.stdin.setEncoding("utf8");
      for await (const chunk of process.stdin) {
        buffer += String(chunk);
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (!line.trim()) continue;
          if (Buffer.byteLength(line) > 64 * 1024)
            throw new CliError("MCP request exceeded 64 KiB");
          let message: { id?: unknown };
          try {
            message = JSON.parse(line) as { id?: unknown };
          } catch {
            process.stdout.write(
              `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`,
            );
            continue;
          }
          try {
            for (const result of await relayMcp(
              `${base}/mcp`,
              message,
              authorization,
            ))
              process.stdout.write(`${JSON.stringify(result)}\n`);
          } catch {
            if (message && typeof message === "object" && "id" in message)
              process.stdout.write(
                `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: "Remote MCP request failed; check the authentication context and organization MCP setting" } })}\n`,
              );
            else process.stderr.write("Remote MCP notification failed\n");
          }
        }
        if (Buffer.byteLength(buffer) > 64 * 1024)
          throw new CliError("MCP request exceeded 64 KiB");
      }
      if (buffer.trim())
        throw new CliError(
          "Incomplete MCP message; stdio messages must end with a newline",
        );
    });
  return command;
}

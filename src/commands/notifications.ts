import { Command } from "commander";
import type { NotificationsResponse } from "../api/types";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";
import { age } from "../util/format";

/** `ubctl notifications …` — the org's notification feed. */
export function notificationsCommand(): Command {
  const notifications = new Command("notifications")
    .alias("notifs")
    .description("View and manage notifications");

  withJson(
    notifications
      .command("ls")
      .description("List notifications")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const res = await client.get<NotificationsResponse>("/notifications");
        if (ctx.json) return printJson(res);
        printTable(
          res.notifications.map((n) => ({
            ...n,
            when: age(n.time),
            read: n.read ? "✓" : "",
          })),
          [
            { key: "id", header: "id" },
            { key: "title", header: "title" },
            { key: "tone", header: "tone" },
            { key: "read", header: "read" },
            { key: "when", header: "when" },
          ],
        );
        print("");
        print(`${res.unread} unread`);
      }),
  );

  notifications
    .command("read [id]")
    .description("Mark one notification read, or all if no id is given")
    .action(async (id: string | undefined, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      if (id) {
        await client.post(`/notifications/${id}/read`);
        print(`Marked ${id} read`);
      } else {
        await client.post("/notifications/read");
        print("Marked all notifications read");
      }
    });

  notifications
    .command("unread <id>")
    .description("Mark a notification unread")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.post(`/notifications/${id}/unread`);
      print(`Marked ${id} unread`);
    });

  return notifications;
}

import { Command, Option } from "commander";
import type {
  MembersResponse,
  InvitationsResponse,
  InvitationResponse,
} from "../api/types";
import { authed, withJson } from "./helpers";
import { print, printJson, printTable } from "../util/output";
import { age } from "../util/format";

const ROLES = ["Owner", "Admin", "Member", "Deploy"];

/**
 * `ubctl team …` — the active org's roster and pending invitations.
 *
 * Inviting/removing acts on the org selected by `--org` (or your default).
 * Personal namespaces have no team — create an organization to collaborate.
 */
export function teamCommand(): Command {
  const team = new Command("team").description(
    "Manage the active org's team and invitations",
  );

  withJson(
    team
      .command("ls")
      .description("List team members")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { members } = await client.get<MembersResponse>("/team");
        if (ctx.json) return printJson(members);
        printTable(members, [
          { key: "id", header: "id" },
          { key: "name", header: "name" },
          { key: "email", header: "email" },
          { key: "role", header: "role" },
        ]);
      }),
  );

  withJson(
    team
      .command("invite <email>")
      .description("Invite a teammate by email")
      .addOption(
        new Option("--role <role>", "role").choices(ROLES).default("Member"),
      )
      .action(async (email: string, opts: { role: string }, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { invitation } = await client.post<InvitationResponse>("/team", {
          email,
          role: opts.role,
        });
        if (ctx.json) return printJson(invitation);
        print(`Invited ${invitation.email} as ${invitation.role}`);
        print("They'll get an email with an accept link.");
      }),
  );

  team
    .command("rm <id>")
    .description("Remove a team member")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/team/${id}`);
      print(`Removed member ${id}`);
    });

  team.addCommand(invitationsCommand());

  return team;
}

function invitationsCommand(): Command {
  const invitations = new Command("invitations")
    .alias("invites")
    .description("Manage pending invitations");

  withJson(
    invitations
      .command("ls")
      .description("List pending invitations")
      .action(async (_opts: unknown, cmd: Command) => {
        const { ctx, client } = authed(cmd);
        const { invitations: rows } =
          await client.get<InvitationsResponse>("/team/invitations");
        if (ctx.json) return printJson(rows);
        printTable(
          rows.map((i) => ({ ...i, created: age(i.createdAt) })),
          [
            { key: "id", header: "id" },
            { key: "email", header: "email" },
            { key: "role", header: "role" },
            { key: "status", header: "status" },
            { key: "created", header: "invited" },
          ],
        );
      }),
  );

  invitations
    .command("rm <id>")
    .description("Revoke a pending invitation")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const { client } = authed(cmd);
      await client.delete(`/team/invitations/${id}`);
      print(`Revoked invitation ${id}`);
    });

  return invitations;
}

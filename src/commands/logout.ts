import { Command } from "commander";
import {
  loadConfig,
  clearConfigKey,
  configPath,
  loadOAuthCredentials,
  removeOAuthCredentials,
} from "../config/store";
import { print } from "../util/output";
import { oauthRequest } from "../auth/oauth";

export function logoutCommand(): Command {
  return new Command("logout")
    .description(
      "Revoke OAuth access and remove saved credentials (keeps api-url and org)",
    )
    .action(async () => {
      const config = loadConfig();
      if (!config.token && !config.oauth) {
        print("Not logged in — nothing to do.");
        return;
      }
      if (config.oauth && config.apiUrl) {
        try {
          const oauth = loadOAuthCredentials(config.oauth);
          await oauthRequest(config.apiUrl, "revoke", {
            client_id: "ubctl",
            token: oauth.refreshToken ?? oauth.accessToken,
          });
        } catch {
          process.stderr.write(
            "Warning: remote revocation failed; revoke the connection in Cloud Settings → Integrations. Local credentials were removed.\n",
          );
        }
      }
      clearConfigKey("token");
      clearConfigKey("oauth");
      if (config.oauth) removeOAuthCredentials(config.oauth.grantId);
      print(`Logged out. Token removed from ${configPath()}`);
    });
}

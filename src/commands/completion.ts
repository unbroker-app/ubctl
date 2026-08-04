import { Command, InvalidArgumentError } from "commander";
import { print } from "../util/output";

const topLevel = [
  "login",
  "logout",
  "whoami",
  "auth",
  "apps",
  "beacon",
  "github",
  "monitoring",
  "tokens",
  "account",
  "billing",
  "orgs",
  "team",
  "notifications",
  "droplets",
  "db",
];

export function completionCommand(): Command {
  return new Command("completion")
    .description("Generate shell completion")
    .argument("<shell>", "bash, zsh, or fish")
    .action((shell: string) => {
      const commands = topLevel.join(" ");
      if (shell === "bash")
        return print(
          `_ubctl_complete() { COMPREPLY=( $(compgen -W "${commands}" -- "${"${COMP_WORDS[COMP_CWORD]}"}") ); }\ncomplete -F _ubctl_complete ubctl`,
        );
      if (shell === "zsh")
        return print(
          `#compdef ubctl\n_arguments '1:command:(${commands})' '*::arg:->args'`,
        );
      if (shell === "fish")
        return print(
          `complete -c ubctl -f -n '__fish_use_subcommand' -a '${commands}'`,
        );
      throw new InvalidArgumentError("shell must be bash, zsh, or fish");
    });
}

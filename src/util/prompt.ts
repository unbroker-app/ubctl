import readline from "node:readline";

/**
 * Read a line from stdin, suppressing echo so a pasted secret never appears on
 * screen or in the terminal scrollback. Implemented by overriding readline's
 * private `_writeToOutput` to emit only the prompt, never the typed characters.
 */
export function promptHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    }) as readline.Interface & { _writeToOutput?: (s: string) => void };

    let prompted = false;
    rl._writeToOutput = (_s: string) => {
      // Emit the prompt once; swallow the echoed keystrokes entirely.
      if (!prompted) {
        process.stdout.write(query);
        prompted = true;
      }
    };

    rl.question(query, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

/** Read all of piped stdin (for `… | ubctl login`). Empty when stdin is a TTY. */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

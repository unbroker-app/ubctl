/**
 * A user-facing error: its message is printed without a stack trace and exits
 * non-zero (see index.ts). Use for expected failures — not logged in, missing
 * argument — as opposed to bugs, which should throw a plain Error.
 */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

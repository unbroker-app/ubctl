import { InvalidArgumentError } from "commander";

export function positiveInteger(
  value: string,
  label: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!/^\d+$/.test(value))
    throw new InvalidArgumentError(`${label} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    const range = max === Number.MAX_SAFE_INTEGER ? "positive" : `between 1 and ${max}`;
    throw new InvalidArgumentError(`${label} must be ${range}`);
  }
  return parsed;
}

export function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new InvalidArgumentError(`${label} must be a positive number`);
  return parsed;
}

export function githubRepositoryUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidArgumentError("repo must be a valid GitHub URL");
  }
  const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || parts.length !== 2) {
    throw new InvalidArgumentError(
      "repo must match https://github.com/<owner>/<repo>",
    );
  }
  return value;
}

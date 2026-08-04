import { InvalidArgumentError } from "commander";

export function contextName(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value))
    throw new InvalidArgumentError(
      "context name must contain only letters, numbers, dot, dash or underscore",
    );
  return value;
}

export function positiveInteger(
  value: string,
  label: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!/^\d+$/.test(value))
    throw new InvalidArgumentError(`${label} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    const range =
      max === Number.MAX_SAFE_INTEGER ? "positive" : `between 1 and ${max}`;
    throw new InvalidArgumentError(`${label} must be ${range}`);
  }
  return parsed;
}

export function positiveNumber(value: string, label: string): number {
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))
    throw new InvalidArgumentError(
      `${label} must be a positive decimal number`,
    );
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new InvalidArgumentError(`${label} must be a positive number`);
  return parsed;
}

export function repositoryUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidArgumentError("repo must be a valid repository URL");
  }
  const parts = url.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  const hosts = new Set(["github.com", "gitlab.com", "bitbucket.org"]);
  if (
    url.protocol !== "https:" ||
    !hosts.has(url.hostname) ||
    parts.length !== 2 ||
    Boolean(url.username || url.password || url.search || url.hash) ||
    !parts.every((part) => /^[\w.-]+$/.test(part))
  ) {
    throw new InvalidArgumentError(
      "repo must be an HTTPS GitHub, GitLab or Bitbucket owner/repo URL",
    );
  }
  return `https://${url.hostname}/${parts[0]}/${parts[1]}`;
}

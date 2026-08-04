// Single source of truth for the CLI version, kept in sync with package.json by
// the release workflow. Inlined (not read from package.json at runtime) so the
// bundled single-file binary has no filesystem dependency.
export const VERSION = "0.4.0";

/**
 * Pure parser for the `/install` argument. Turns a repo spec into a normalized,
 * clonable source — never touches the network or filesystem.
 */

export type InstallScope = "project" | "global";

/** A normalized, clonable git source plus where to install it. */
export type InstallSource = {
  /** A git-clonable URL (https or scp-style). */
  readonly url: string;
  /** Directory name the repo is installed under (safe basename). */
  readonly name: string;
  /** Optional branch / tag / commit to check out. */
  readonly ref?: string;
  readonly scope: InstallScope;
};

export type ParsedInstall = InstallSource | { readonly error: string };

const GITHUB_SHORTHAND = /^[\w.-]+\/[\w.-]+$/;
const SCP_URL = /^[\w.-]+@[\w.-]+:.+$/;
const SAFE_NAME = /^[\w.-]+$/;

/**
 * Parses `<owner/repo | git-url>[#ref] [--global]` into an {@link InstallSource}.
 * Returns `{ error }` for anything that isn't a recognizable, safe repo spec.
 */
export function parseInstallArg(raw: string): ParsedInstall {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const scope: InstallScope = tokens.some((t) => t === "--global") ? "global" : "project";
  const spec = tokens.find((t) => t !== "--global");
  if (!spec) return { error: "Usage: /install <owner/repo | git-url> [--global]" };

  const hash = spec.indexOf("#");
  const locator = hash >= 0 ? spec.slice(0, hash) : spec;
  const ref = hash >= 0 ? spec.slice(hash + 1) : undefined;
  if (hash >= 0 && !ref) return { error: "Empty ref after '#'." };

  const resolved = resolveLocator(locator);
  if ("error" in resolved) return resolved;

  return ref ? { ...resolved, ref, scope } : { ...resolved, scope };
}

/** Maps a locator (no ref, no flags) to a clone url + safe install name. */
function resolveLocator(locator: string): { url: string; name: string } | { error: string } {
  if (GITHUB_SHORTHAND.test(locator)) {
    const repo = locator.split("/")[1] ?? "";
    const name = sanitize(repo);
    if (!name) return { error: `Cannot derive a name from "${locator}".` };
    return { url: `https://github.com/${locator}.git`, name };
  }

  if (locator.includes("://") || SCP_URL.test(locator)) {
    const name = nameFromUrl(locator);
    if (!name) return { error: `Cannot derive a name from "${locator}".` };
    return { url: locator, name };
  }

  return { error: `Not a repo spec: "${locator}". Use owner/repo or a git URL.` };
}

/** Last path segment of a URL, minus a trailing `.git`, sanitized. */
function nameFromUrl(url: string): string {
  const tail = url.replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
  return sanitize(tail.replace(/\.git$/, ""));
}

/** Returns a safe directory name, or "" if the input can't be made safe. */
function sanitize(value: string): string {
  if (value === "" || value === "." || value === ".." || value.includes("..")) return "";
  return SAFE_NAME.test(value) ? value : "";
}

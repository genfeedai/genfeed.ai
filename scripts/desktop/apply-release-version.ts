/**
 * Stamp the `desktop-v*` tag's version into the desktop package manifest.
 *
 * electron-builder reads the version from `apps/desktop/app/package.json`, and
 * that one field reaches four places at once:
 *
 *   1. the artifact filename  — `GenFeed-${version}-${arch}.dmg`
 *   2. the updater feed       — the `version` in `latest-mac.yml`
 *   3. the release manifest   — `genfeed-desktop-release.json`
 *   4. the Homebrew cask URL  — `.../desktop-v#{version}/GenFeed-#{version}-...`
 *
 * The checked-in value is a placeholder that nothing bumps, so tagging
 * `desktop-v0.2.0` would publish `GenFeed-0.1.0-arm64.dmg` under that tag: a
 * cask URL that 404s, and an updater that compares 0.1.0 against 0.1.0 and
 * concludes there is nothing to install. Running this before the build makes
 * the tag the single source of truth for a desktop release.
 *
 * Off a `desktop-v*` tag (workflow_dispatch, local packaging) it is a no-op —
 * a dispatch build is deliberately unversioned and never published.
 *
 * Usage:
 *     bun run scripts/desktop/apply-release-version.ts
 *     GITHUB_REF_NAME=desktop-v0.2.0 bun run scripts/desktop/apply-release-version.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DESKTOP_TAG_PREFIX = 'desktop-v';

/**
 * Official semver pattern (semver.org), anchored. Deliberately strict: a
 * loose match here becomes an invalid `version` in `latest-mac.yml`, and
 * electron-updater fails to parse the feed rather than skipping one release.
 */
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export interface AppliedReleaseVersion {
  /** False when the ref is not a desktop tag and the manifest was left alone. */
  isApplied: boolean;
  /** The manifest's version after the run, applied or pre-existing. */
  version: string;
}

/**
 * Returns the semver carried by a `desktop-v*` ref, or null for any other ref.
 *
 * Throws on a `desktop-v*` ref whose remainder is not valid semver: a
 * malformed tag is a typo worth failing the release for, not a reason to
 * silently fall back to the placeholder and ship a mislabelled build.
 */
export function parseDesktopTagVersion(ref: string | undefined): string | null {
  if (ref === undefined || !ref.startsWith(DESKTOP_TAG_PREFIX)) {
    return null;
  }

  const version = ref.slice(DESKTOP_TAG_PREFIX.length);

  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(
      `Desktop release tag "${ref}" does not carry a valid semver version. Expected e.g. ${DESKTOP_TAG_PREFIX}0.2.0.`,
    );
  }

  return version;
}

export function applyDesktopReleaseVersion(options: {
  manifestPath: string;
  ref: string | undefined;
}): AppliedReleaseVersion {
  const { manifestPath, ref } = options;
  const source = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(source) as { version?: unknown };

  if (typeof manifest.version !== 'string') {
    throw new Error(`${manifestPath} has no string "version" field.`);
  }

  const version = parseDesktopTagVersion(ref);

  if (version === null) {
    return { isApplied: false, version: manifest.version };
  }

  // Rewrite the field in place rather than re-serializing the whole object:
  // JSON.stringify would reorder nothing but would drop the file's exact
  // formatting, and this manifest is hand-maintained and Biome-formatted.
  const updated = source.replace(
    /("version"\s*:\s*)"[^"]*"/,
    `$1${JSON.stringify(version)}`,
  );

  if (updated === source && manifest.version !== version) {
    throw new Error(
      `Failed to rewrite the "version" field in ${manifestPath}.`,
    );
  }

  writeFileSync(manifestPath, updated);

  return { isApplied: true, version };
}

function main(): void {
  const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
  const manifestPath = path.join(
    repositoryRoot,
    'apps/desktop/app/package.json',
  );

  const { isApplied, version } = applyDesktopReleaseVersion({
    manifestPath,
    ref: process.env.GITHUB_REF_NAME,
  });

  console.info(
    isApplied
      ? `Applied desktop release version ${version} from ${process.env.GITHUB_REF_NAME}.`
      : `Not a ${DESKTOP_TAG_PREFIX}* ref — keeping the manifest version ${version}.`,
  );
}

if (import.meta.main) {
  main();
}

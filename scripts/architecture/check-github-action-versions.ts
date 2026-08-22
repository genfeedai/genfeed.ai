/**
 * Guard GitHub Action pins against mutable refs and version drift.
 *
 * Action versions cannot be centralised the way npm versions are. GitHub
 * resolves `uses:` before any expression context exists, so
 * `uses: actions/checkout@${{ env.CHECKOUT_VERSION }}` is rejected at workflow
 * parse time — the ref has to be a literal in every file that needs it. There
 * is no `package.json` to read it from and no way to build one: the version
 * lives in 70-odd places by design, and npm-check-updates never sees any of
 * them. `bun run deps:update` therefore also runs
 * `scripts/architecture/update-github-action-versions.ts` so package bumps and
 * Action pins stay on one command. The updater resolves the upstream release
 * tag to its full commit SHA and retains the tag in a reviewable comment:
 *
 *   uses: actions/checkout@<40-character SHA> # v7.0.1
 *
 * What replaces a single source of truth is a single *rule*: every external
 * action uses a full immutable SHA, and one action resolves to one SHA across
 * the repository. This covers actions nobody has added yet and catches drift
 * across both workflows and composite actions. A digest without a release
 * comment remains a deliberate manual pin; the updater does not move it.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const WORKFLOW_GLOBS = [
  '.github/workflows/*.{yml,yaml}',
  '.github/actions/**/action.{yml,yaml}',
];

/** GitHub's immutable action policy requires a full 40-character commit SHA. */
export const COMMIT_DIGEST = /^[0-9a-f]{40}$/;

const USES_LINE = /^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|(\S+))/;
const VERSION_COMMENT =
  /\s+#\s+((?:v)?\d+(?:\.\d+){0,3}(?:-[\w.]+)?)(?:\s+\|\s+.*)?\s*$/i;

export type ActionReference = {
  /** `owner/repo`, with any sub-action path stripped: sub-actions ship together. */
  action: string;
  file: string;
  line: number;
  /** Human-reviewable upstream release tag, when the pin is updater-owned. */
  release?: string;
  version: string;
};

export type ActionVersionViolation = {
  action: string;
  message: string;
  references: ActionReference[];
};

export function parseUsesLine(line: string): string | null {
  const usesMatch = line.match(USES_LINE);

  return usesMatch?.[1] ?? usesMatch?.[2] ?? usesMatch?.[3] ?? null;
}

export function parseVersionComment(line: string): string | null {
  return line.match(VERSION_COMMENT)?.[1] ?? null;
}

/**
 * Local refs (`./.github/...`) and container refs (`docker://…`) carry no
 * upstream version to keep in step, so neither is a pin this guard governs.
 */
export function parseUsesTarget(rawTarget: string): {
  action: string;
  version: string;
} | null {
  if (rawTarget.startsWith('./') || rawTarget.startsWith('docker://')) {
    return null;
  }

  const separatorIndex = rawTarget.lastIndexOf('@');

  if (separatorIndex <= 0) {
    return null;
  }

  const target = rawTarget.slice(0, separatorIndex);
  const version = rawTarget.slice(separatorIndex + 1);

  if (!version) {
    return null;
  }

  const [owner, repository] = target.split('/');

  if (!owner || !repository) {
    return null;
  }

  return { action: `${owner}/${repository}`, version };
}

export function collectActionReferences(): ActionReference[] {
  const filePaths = globSync(WORKFLOW_GLOBS, { nodir: true }).sort(
    (left, right) => left.localeCompare(right),
  );
  const references: ActionReference[] = [];

  for (const filePath of filePaths) {
    const lines = readFileSync(filePath, 'utf8').split('\n');

    for (const [index, line] of lines.entries()) {
      const usesTarget = parseUsesLine(line);

      if (!usesTarget) {
        continue;
      }

      const parsed = parseUsesTarget(usesTarget);

      if (!parsed) {
        continue;
      }

      const release = parseVersionComment(line);
      const reference: ActionReference = {
        action: parsed.action,
        file: filePath,
        line: index + 1,
        version: parsed.version,
      };

      if (release) {
        reference.release = release;
      }

      references.push(reference);
    }
  }

  return references;
}

export function checkGitHubActionVersions(): ActionVersionViolation[] {
  const referencesByAction = new Map<string, ActionReference[]>();

  for (const reference of collectActionReferences()) {
    const existing = referencesByAction.get(reference.action);

    if (existing) {
      existing.push(reference);
      continue;
    }

    referencesByAction.set(reference.action, [reference]);
  }

  const violations: ActionVersionViolation[] = [];

  for (const [action, references] of [...referencesByAction].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const mutableReferences = references.filter(
      ({ version }) => !COMMIT_DIGEST.test(version),
    );

    if (mutableReferences.length > 0) {
      violations.push({
        action,
        message: `${action} must use a full immutable commit SHA; mutable tags and branches are forbidden.`,
        references: mutableReferences,
      });
    }

    const immutableReferences = references.filter(({ version }) =>
      COMMIT_DIGEST.test(version),
    );
    const versions = [
      ...new Set(immutableReferences.map(({ version }) => version)),
    ];

    if (versions.length > 1) {
      // The most-used SHA is almost always the intended one, so reporting
      // everything except it points straight at the files left behind.
      const dominantVersion = [...versions].sort((left, right) => {
        const countDifference =
          immutableReferences.filter(({ version }) => version === right)
            .length -
          immutableReferences.filter(({ version }) => version === left).length;

        return countDifference === 0
          ? left.localeCompare(right)
          : countDifference;
      })[0];

      violations.push({
        action,
        message: `${action} is pinned to multiple SHAs; every reference for one action must match.`,
        references: immutableReferences.filter(
          ({ version }) => version !== dominantVersion,
        ),
      });
    }

    const releases = [
      ...new Set(
        references
          .map(({ release }) => release)
          .filter((release): release is string => release !== undefined),
      ),
    ];

    if (releases.length > 1) {
      const dominantRelease = [...releases].sort((left, right) => {
        const countDifference =
          references.filter(({ release }) => release === right).length -
          references.filter(({ release }) => release === left).length;

        return countDifference === 0
          ? left.localeCompare(right)
          : countDifference;
      })[0];

      violations.push({
        action,
        message: `${action} has inconsistent release comments: ${[...releases].sort().join(' and ')}.`,
        references: references.filter(
          ({ release }) => release !== undefined && release !== dominantRelease,
        ),
      });
    }
  }

  return violations;
}

if (import.meta.main) {
  const violations = checkGitHubActionVersions();

  if (violations.length > 0) {
    console.error('GitHub Action version drift found:');

    for (const violation of violations) {
      console.error(`- ${violation.message}`);

      for (const reference of violation.references) {
        console.error(
          `    ${reference.file}:${reference.line} uses ${reference.action}@${reference.version}`,
        );
      }
    }

    process.exit(1);
  }

  const references = collectActionReferences();
  const referenceCount = references.length;
  const actionCount = new Set(references.map(({ action }) => action)).size;

  console.log(
    `GitHub Action pin guard passed: ${actionCount} actions immutable and consistent across ${referenceCount} references.`,
  );
}

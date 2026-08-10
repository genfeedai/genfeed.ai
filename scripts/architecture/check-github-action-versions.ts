/**
 * Guard GitHub Action pins against version drift.
 *
 * Action versions cannot be centralised the way npm versions are. GitHub
 * resolves `uses:` before any expression context exists, so
 * `uses: actions/checkout@${{ env.CHECKOUT_VERSION }}` is rejected at workflow
 * parse time — the ref has to be a literal in every file that needs it. There
 * is no `package.json` to read it from and no way to build one: the version
 * lives in 70-odd places by design, and `bun run deps:update`
 * (npm-check-updates) never sees any of them.
 *
 * What replaces a single source of truth is a single *rule*: an action pinned
 * by tag resolves to exactly one version across the repository. That needs no
 * maintained list, covers actions nobody has added yet, and catches the drift
 * that actually happens — a file the update PR missed. Two live examples when
 * this guard was written: `publish-packages.yml` sat on
 * `actions/upload-artifact@v4` while 27 other refs had moved to v7, and
 * `.github/actions/setup-bun-env/action.yml` sat on `actions/setup-node@v5`
 * after the workflows moved to v7, because composite actions are a second
 * surface that a workflows-only sweep walks straight past.
 *
 * Digest pins are exempt. `actions/checkout@93cb6ef… # v5` is a deliberate
 * supply-chain control and cannot be compared against a tag without resolving
 * the digest, so the two spellings are allowed to disagree. Bumping one is a
 * reviewed change, not a sweep.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const WORKFLOW_GLOBS = [
  '.github/workflows/*.{yml,yaml}',
  '.github/actions/**/action.{yml,yaml}',
];

/** A 40-character hex ref is a commit digest, not a release tag. */
const COMMIT_DIGEST = /^[0-9a-f]{40}$/;

const USES_LINE = /^\s*(?:-\s*)?uses:\s*(\S+)/;

export type ActionReference = {
  /** `owner/repo`, with any sub-action path stripped: sub-actions ship together. */
  action: string;
  file: string;
  line: number;
  version: string;
};

export type ActionVersionViolation = {
  action: string;
  message: string;
  references: ActionReference[];
};

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
      const usesMatch = line.match(USES_LINE);

      if (!usesMatch) {
        continue;
      }

      const parsed = parseUsesTarget(usesMatch[1]);

      if (!parsed || COMMIT_DIGEST.test(parsed.version)) {
        continue;
      }

      references.push({
        action: parsed.action,
        file: filePath,
        line: index + 1,
        version: parsed.version,
      });
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
    const versions = [...new Set(references.map(({ version }) => version))];

    if (versions.length < 2) {
      continue;
    }

    // The most-used version is almost always the intended one, so reporting
    // everything *except* it points straight at the files left behind rather
    // than dumping all 70-odd refs of a widely used action.
    const dominantVersion = [...versions].sort((left, right) => {
      const countDifference =
        references.filter(({ version }) => version === right).length -
        references.filter(({ version }) => version === left).length;

      return countDifference === 0
        ? left.localeCompare(right)
        : countDifference;
    })[0];

    violations.push({
      action,
      message: `${action} is tag-pinned to ${[...versions].sort().join(' and ')}; every tag pin for one action must match.`,
      references: references.filter(
        ({ version }) => version !== dominantVersion,
      ),
    });
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

  const referenceCount = collectActionReferences().length;
  const actionCount = new Set(
    collectActionReferences().map(({ action }) => action),
  ).size;

  console.log(
    `GitHub Action version guard passed: ${actionCount} actions consistent across ${referenceCount} tag pins.`,
  );
}

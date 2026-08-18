/**
 * Bump GitHub Action tag pins to the latest upstream release.
 *
 * `bun run deps:update` (npm-check-updates) never sees `uses:` pins. This
 * script is the matching updater: one version per action, applied to every
 * workflow and composite action. Digest pins, local refs, container refs, and
 * branch pins (`master` / `main`) stay untouched.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import {
  type ActionReference,
  collectActionReferences,
  parseUsesLine,
  parseUsesTarget,
} from './check-github-action-versions';

const COMMIT_DIGEST = /^[0-9a-f]{40}$/;
const VERSION_TAG = /^(?:v)?\d+(?:\.\d+){0,3}(?:-[\w.]+)?$/i;
const BRANCH_PIN = /^(master|main|develop|HEAD)$/i;

export type GitHubReleaseLookup = (action: string) => Promise<string | null>;

export type PlannedActionUpdate = {
  action: string;
  from: string[];
  to: string;
  files: string[];
};

export function isVersionTag(version: string): boolean {
  return VERSION_TAG.test(version) && !BRANCH_PIN.test(version);
}

export function parseVersionParts(version: string): number[] | null {
  const match = version.trim().match(/^v?(\d+(?:\.\d+){0,3})(?:-[\w.]+)?$/i);

  if (!match?.[1]) {
    return null;
  }

  return match[1].split('.').map(Number);
}

export function compareVersionTags(left: string, right: string): number {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);

  if (!leftParts || !rightParts) {
    return left.localeCompare(right);
  }

  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

export function rewriteUsesLine(
  line: string,
  action: string,
  nextVersion: string,
): string {
  const rawTarget = parseUsesLine(line);

  if (!rawTarget) {
    return line;
  }

  const parsed = parseUsesTarget(rawTarget);

  if (!parsed || parsed.action !== action) {
    return line;
  }

  if (
    COMMIT_DIGEST.test(parsed.version) ||
    !isVersionTag(parsed.version) ||
    parsed.version === nextVersion
  ) {
    return line;
  }

  const nextTarget = `${rawTarget.slice(0, rawTarget.lastIndexOf('@'))}@${nextVersion}`;

  return line.replace(rawTarget, nextTarget);
}

export function planActionVersionUpdates(
  references: ActionReference[],
  latestByAction: Map<string, string>,
): PlannedActionUpdate[] {
  const referencesByAction = new Map<string, ActionReference[]>();

  for (const reference of references) {
    if (!isVersionTag(reference.version)) {
      continue;
    }

    const existing = referencesByAction.get(reference.action);

    if (existing) {
      existing.push(reference);
      continue;
    }

    referencesByAction.set(reference.action, [reference]);
  }

  const updates: PlannedActionUpdate[] = [];

  for (const [action, actionReferences] of [...referencesByAction].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const latest = latestByAction.get(action);

    if (!latest || !isVersionTag(latest)) {
      continue;
    }

    const currentVersions = [
      ...new Set(actionReferences.map(({ version }) => version)),
    ].sort(compareVersionTags);
    const newestCurrent = currentVersions.at(-1);

    if (
      (currentVersions.length === 1 && currentVersions[0] === latest) ||
      (newestCurrent !== undefined &&
        compareVersionTags(latest, newestCurrent) < 0)
    ) {
      continue;
    }

    updates.push({
      action,
      from: currentVersions,
      to: latest,
      files: [...new Set(actionReferences.map(({ file }) => file))].sort(
        (left, right) => left.localeCompare(right),
      ),
    });
  }

  return updates;
}

export async function fetchLatestReleaseTag(
  action: string,
): Promise<string | null> {
  const [owner, repository] = action.split('/');

  if (!owner || !repository) {
    return null;
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'genfeedai-deps-update',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo task
  const token = process.env.GITHUB_TOKEN;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const latestResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/releases/latest`,
    { headers },
  );

  if (latestResponse.ok) {
    const body = (await latestResponse.json()) as { tag_name?: unknown };
    const tagName =
      typeof body.tag_name === 'string' ? body.tag_name : undefined;

    if (tagName && isVersionTag(tagName)) {
      return tagName;
    }
  }

  const tagsResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/tags?per_page=30`,
    { headers },
  );

  if (!tagsResponse.ok) {
    return null;
  }

  const tags = (await tagsResponse.json()) as Array<{ name?: unknown }>;
  const versions = tags
    .map((tag) => (typeof tag.name === 'string' ? tag.name : null))
    .filter((name): name is string => name !== null && isVersionTag(name))
    .sort(compareVersionTags);

  return versions.at(-1) ?? null;
}

export function applyActionVersionUpdates(
  updates: PlannedActionUpdate[],
): void {
  for (const update of updates) {
    for (const filePath of update.files) {
      const original = readFileSync(filePath, 'utf8');
      const next = original
        .split('\n')
        .map((line) => rewriteUsesLine(line, update.action, update.to))
        .join('\n');

      if (next !== original) {
        writeFileSync(filePath, next);
      }
    }
  }
}

export async function updateGitHubActionVersions(options?: {
  dryRun?: boolean;
  lookup?: GitHubReleaseLookup;
}): Promise<PlannedActionUpdate[]> {
  const references = collectActionReferences();
  const actions = [...new Set(references.map(({ action }) => action))].sort(
    (left, right) => left.localeCompare(right),
  );
  const lookup = options?.lookup ?? fetchLatestReleaseTag;
  const latestByAction = new Map<string, string>();

  for (const action of actions) {
    const latest = await lookup(action);

    if (latest) {
      latestByAction.set(action, latest);
    }
  }

  const updates = planActionVersionUpdates(references, latestByAction);

  if (!options?.dryRun) {
    applyActionVersionUpdates(updates);
  }

  return updates;
}

if (import.meta.main) {
  const dryRun = process.argv.includes('--dry-run');
  const updates = await updateGitHubActionVersions({ dryRun });

  if (updates.length === 0) {
    console.log('GitHub Action pins are already current.');
    process.exit(0);
  }

  console.log(
    dryRun ? 'GitHub Action updates available:' : 'Updated GitHub Action pins:',
  );

  for (const update of updates) {
    console.log(
      `- ${update.action}: ${update.from.join(', ')} -> ${update.to}`,
    );

    for (const filePath of update.files) {
      console.log(`    ${filePath}`);
    }
  }
}

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

import {
  ENV_TARGETS,
  type EnvMode,
  GENERATED_ENV_HEADER,
  getCanonicalEnvPath,
  getSectionForKey,
  LEGACY_ENV_HEADER,
  ROOT_ENV_SECTIONS,
} from './env-spec';

interface CliOptions {
  importExisting: boolean;
  mode: EnvMode;
  pruneLegacy: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const modeArg = argv[2];
  if (
    modeArg !== 'local' &&
    modeArg !== 'staging' &&
    modeArg !== 'production'
  ) {
    throw new Error(
      'Usage: bun run env:sync <local|staging|production> [--import-existing] [--prune-legacy]',
    );
  }

  return {
    importExisting: argv.includes('--import-existing'),
    mode: modeArg,
    pruneLegacy: argv.includes('--prune-legacy'),
  };
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return dotenv.parse(fs.readFileSync(filePath));
}

function legacyFilesForTarget(targetPath: string, mode: EnvMode): string[] {
  if (mode === 'local') {
    return [path.join(targetPath, '.env'), path.join(targetPath, '.env.local')];
  }

  return [path.join(targetPath, `.env.${mode}`)];
}

interface EnvEntry {
  canonicalKey: string;
  targetKey: string;
  value: string;
}

function formatSectionedEnvFile(entries: EnvEntry[], header: string[]): string {
  const lines = [...header];
  const sectionBuckets = new Map<string, EnvEntry[]>();
  const sectionOrder = new Map<string, number>();

  for (const entry of entries) {
    const section = getSectionForKey(entry.canonicalKey);
    const title = section?.title ?? 'Uncategorized';
    const order = section?.index ?? ROOT_ENV_SECTIONS.length;

    if (!sectionBuckets.has(title)) {
      sectionBuckets.set(title, []);
      sectionOrder.set(title, order);
    }

    sectionBuckets.get(title)?.push(entry);
  }

  const orderedSections = [...sectionBuckets.entries()].sort(
    ([leftTitle], [rightTitle]) => {
      const leftOrder = sectionOrder.get(leftTitle) ?? ROOT_ENV_SECTIONS.length;
      const rightOrder =
        sectionOrder.get(rightTitle) ?? ROOT_ENV_SECTIONS.length;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return leftTitle.localeCompare(rightTitle);
    },
  );

  for (const [index, [title, sectionEntries]] of orderedSections.entries()) {
    lines.push(`# ${title}`);

    for (const entry of sectionEntries) {
      lines.push(`${entry.targetKey}=${entry.value}`);
    }

    if (index < orderedSections.length - 1) {
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildReverseMap(
  mappedKeys: Record<string, string>,
): Map<string, string> {
  const reverseMap = new Map<string, string>();

  for (const [canonicalKey, targetKey] of Object.entries(mappedKeys)) {
    reverseMap.set(targetKey, canonicalKey);
  }

  return reverseMap;
}

function buildCanonicalEntries(canonical: Record<string, string>): EnvEntry[] {
  return Object.entries(canonical)
    .map(([key, value]) => ({
      canonicalKey: key,
      targetKey: key,
      value,
    }))
    .sort((left, right) => {
      const leftSection = getSectionForKey(left.canonicalKey);
      const rightSection = getSectionForKey(right.canonicalKey);

      if (
        leftSection &&
        rightSection &&
        leftSection.index !== rightSection.index
      ) {
        return leftSection.index - rightSection.index;
      }

      if (!leftSection && rightSection) {
        return 1;
      }

      if (leftSection && !rightSection) {
        return -1;
      }

      if (
        leftSection &&
        rightSection &&
        leftSection.index === rightSection.index
      ) {
        const sectionKeys = ROOT_ENV_SECTIONS[leftSection.index]?.keys ?? [];
        const leftIndex = sectionKeys.indexOf(left.canonicalKey);
        const rightIndex = sectionKeys.indexOf(right.canonicalKey);

        if (leftIndex !== rightIndex) {
          return leftIndex - rightIndex;
        }
      }

      return left.canonicalKey.localeCompare(right.canonicalKey);
    });
}

function writeCanonicalEnvFile(
  mode: EnvMode,
  canonical: Record<string, string>,
) {
  const canonicalPath = getCanonicalEnvPath(mode);
  const sortedEntries = buildCanonicalEntries(canonical);

  fs.writeFileSync(
    canonicalPath,
    formatSectionedEnvFile(sortedEntries, [
      `# Canonical ${mode} env file.`,
      '# Imported from legacy app/service env files.',
      '# Edit this file, then rerun `bun run env:sync` for the same mode.',
      '',
    ]),
  );
}

function mergeLegacyIntoCanonical(mode: EnvMode): {
  canonical: Record<string, string>;
  conflicts: string[];
} {
  const canonicalPath = getCanonicalEnvPath(mode);
  const canonical = parseEnvFile(canonicalPath);
  const conflicts = new Set<string>();

  for (const target of ENV_TARGETS) {
    const reverseMap = buildReverseMap(target.mappedKeys);

    for (const legacyPath of legacyFilesForTarget(target.path, mode)) {
      const parsed = parseEnvFile(legacyPath);

      for (const [key, value] of Object.entries(parsed)) {
        const canonicalKey =
          reverseMap.get(key) ??
          (target.sharedKeys.includes(key) || target.directKeys.includes(key)
            ? key
            : null);

        if (!canonicalKey) {
          continue;
        }

        const previousValue = canonical[canonicalKey];
        if (
          typeof previousValue === 'string' &&
          previousValue.length > 0 &&
          previousValue !== value
        ) {
          conflicts.add(canonicalKey);
          continue;
        }

        canonical[canonicalKey] = value;
      }
    }
  }

  writeCanonicalEnvFile(mode, canonical);

  return { canonical, conflicts: [...conflicts].sort() };
}

function syncTarget(
  mode: EnvMode,
  canonical: Record<string, string>,
): string[] {
  const writtenFiles: string[] = [];

  for (const target of ENV_TARGETS) {
    const entries: EnvEntry[] = [];
    const seenTargetKeys = new Set<string>();

    const addEntry = (
      canonicalKey: string,
      targetKey: string,
      value: string | undefined,
    ) => {
      if (!value || seenTargetKeys.has(targetKey)) {
        return;
      }

      seenTargetKeys.add(targetKey);
      entries.push({ canonicalKey, targetKey, value });
    };

    for (const key of target.sharedKeys) {
      addEntry(key, key, canonical[key]);
    }

    for (const key of target.directKeys) {
      addEntry(key, key, canonical[key]);
    }

    for (const [canonicalKey, targetKey] of Object.entries(target.mappedKeys)) {
      addEntry(canonicalKey, targetKey, canonical[canonicalKey]);
    }

    if (entries.length === 0) {
      continue;
    }

    const outputPath = target.generatedFileByMode[mode];
    fs.writeFileSync(
      outputPath,
      formatSectionedEnvFile(entries, GENERATED_ENV_HEADER),
    );
    writtenFiles.push(outputPath);
  }

  return writtenFiles;
}

function pruneLegacyLocalFiles(): string[] {
  const prunedFiles: string[] = [];

  for (const target of ENV_TARGETS) {
    if (!target.localLegacyFile || !fs.existsSync(target.localLegacyFile)) {
      continue;
    }

    fs.writeFileSync(
      target.localLegacyFile,
      `${LEGACY_ENV_HEADER.join('\n').trimEnd()}\n`,
    );
    prunedFiles.push(target.localLegacyFile);
  }

  return prunedFiles;
}

function main() {
  const options = parseArgs(process.argv);
  const canonicalPath = getCanonicalEnvPath(options.mode);

  const importResult = options.importExisting
    ? mergeLegacyIntoCanonical(options.mode)
    : {
        canonical: parseEnvFile(canonicalPath),
        conflicts: [],
      };

  if (Object.keys(importResult.canonical).length === 0) {
    throw new Error(
      `Canonical env file ${canonicalPath} is missing or empty. Create it first or rerun with --import-existing.`,
    );
  }

  writeCanonicalEnvFile(options.mode, importResult.canonical);
  const writtenFiles = syncTarget(options.mode, importResult.canonical);
  const prunedFiles =
    options.mode === 'local' && options.pruneLegacy
      ? pruneLegacyLocalFiles()
      : [];

  console.log(
    `Synced ${writtenFiles.length} env files from ${canonicalPath} (${options.mode}).`,
  );

  if (importResult.conflicts.length > 0) {
    console.log(
      `Skipped ${importResult.conflicts.length} conflicting canonical keys: ${importResult.conflicts.join(', ')}`,
    );
  }

  if (prunedFiles.length > 0) {
    console.log(`Pruned ${prunedFiles.length} legacy local .env files.`);
  }
}

main();

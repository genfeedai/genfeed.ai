import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REMOTION_MANIFESTS = [
  'apps/server/files/package.json',
  'apps/app/package.json',
  'packages/props/package.json',
];
const RENDERER_CONTRACT =
  'packages/contracts/src/interfaces/editor/editor-export-contract.interface.ts';
const RENDERER_VERSION_DECLARATION =
  /export const EDITOR_RENDERER_VERSION = 'remotion@[^']+' as const;/g;

type Manifest = {
  dependencies?: Record<string, string>;
};

/** Keep the literal wire-contract version in sync with the exact package pins. */
export function syncRemotionVersion(rootDirectory = process.cwd()): string {
  const manifests = REMOTION_MANIFESTS.map((relativePath) => ({
    manifest: JSON.parse(
      readFileSync(path.join(rootDirectory, relativePath), 'utf8'),
    ) as Manifest,
    relativePath,
  }));
  const version = manifests[0]?.manifest.dependencies?.remotion;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      'The files renderer must declare an exact Remotion version.',
    );
  }

  for (const { manifest, relativePath } of manifests) {
    const remotionDependencies = Object.entries(
      manifest.dependencies ?? {},
    ).filter(([name]) => name === 'remotion' || name.startsWith('@remotion/'));
    if (remotionDependencies.length === 0) {
      throw new Error(`${relativePath} has no Remotion dependencies.`);
    }
    for (const [name, pin] of remotionDependencies) {
      if (pin !== version) {
        throw new Error(
          `${relativePath}: ${name} must match remotion@${version}, found ${pin}.`,
        );
      }
    }
  }

  const contractPath = path.join(rootDirectory, RENDERER_CONTRACT);
  const original = readFileSync(contractPath, 'utf8');
  if ([...original.matchAll(RENDERER_VERSION_DECLARATION)].length !== 1) {
    throw new Error(
      'Expected one EDITOR_RENDERER_VERSION literal declaration.',
    );
  }
  const next = original.replace(
    RENDERER_VERSION_DECLARATION,
    `export const EDITOR_RENDERER_VERSION = 'remotion@${version}' as const;`,
  );
  if (next !== original) {
    writeFileSync(contractPath, next);
  }
  return version;
}

if (import.meta.main) {
  console.log(
    `Editor renderer contract aligned with remotion@${syncRemotionVersion()}.`,
  );
}

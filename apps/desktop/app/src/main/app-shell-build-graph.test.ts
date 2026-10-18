import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface TurboTaskConfig {
  dependsOn?: string[];
}

interface TurboConfig {
  tasks: Record<string, TurboTaskConfig>;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(currentDir, '../..');

// turbo.json is JSONC: drop whole-line `//` comments before parsing.
function readTurboConfig(packageRoot: string): TurboConfig {
  const raw = fs.readFileSync(path.join(packageRoot, 'turbo.json'), 'utf8');
  const withoutComments = raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

  return JSON.parse(withoutComments) as TurboConfig;
}

describe('desktop app-shell build graph', () => {
  const appBuildDependencies = (
    readTurboConfig(path.resolve(desktopRoot, '../../app')).tasks.build
      .dependsOn ?? []
  ).filter((dependency) => dependency.endsWith('#build'));

  it('builds the workspace packages apps/app resolves from dist', () => {
    expect(appBuildDependencies).toContain('@genfeedai/serializers#build');
  });

  it.each(['build', 'qa:release'])(
    'makes the %s task build every package the app build depends on',
    (task) => {
      const dependsOn = readTurboConfig(desktopRoot).tasks[task]?.dependsOn;

      expect(dependsOn).toEqual(
        expect.arrayContaining(['$TURBO_EXTENDS$', ...appBuildDependencies]),
      );
    },
  );
});

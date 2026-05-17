import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const GENERATED_SOURCE_ARTIFACT_PATTERN = /\.(?:js|js\.map|d\.ts\.map)$/;

function collectGeneratedArtifacts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectGeneratedArtifacts(path);
    }
    return GENERATED_SOURCE_ARTIFACT_PATTERN.test(entry.name) ? [path] : [];
  });
}

describe('schema source tree', () => {
  it('does not contain generated JavaScript artifacts', () => {
    expect(collectGeneratedArtifacts(__dirname)).toEqual([]);
  });
});

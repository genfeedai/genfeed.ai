import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('app frontend build graph', () => {
  it('does not wait on the workflows tsup graph before next build', () => {
    const turbo = JSON.parse(readAppFile('turbo.json')) as {
      tasks: { build: { dependsOn: string[] } };
    };

    expect(turbo.tasks.build.dependsOn).toEqual([
      '//#env:check',
      '@genfeedai/auth-client#build',
      '@genfeedai/config#build',
      '@genfeedai/pricing#build',
    ]);
    expect(turbo.tasks.build.dependsOn).not.toContain('^build');
    expect(turbo.tasks.build.dependsOn.join(' ')).not.toContain('workflows');
  });

  it('aliases workflow UI and nodes to package source', () => {
    const nextConfig = readAppFile('next.config.ts');

    expect(nextConfig).toContain(
      "'@genfeedai/workflows/ui': '../../packages/workflows/src/ui/index.ts'",
    );
    expect(nextConfig).toContain(
      "'@genfeedai/workflows/nodes': '../../packages/workflows/src/nodes/index.ts'",
    );
  });
});

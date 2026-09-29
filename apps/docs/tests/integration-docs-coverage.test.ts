import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const integrationsContentDirectory = path.join(
  repositoryRoot,
  'apps/docs/content/integrations',
);

function readIntegrationDoc(fileName: string): string {
  return fs.readFileSync(
    path.join(integrationsContentDirectory, fileName),
    'utf8',
  );
}

function readEnumBlock(source: string, enumName: string): string {
  const match = source.match(new RegExp(`enum ${enumName} \\{([\\s\\S]*?)\\}`));
  expect(match, `${enumName} enum`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('integration documentation coverage', () => {
  it('documents every credential-platform registry key', () => {
    const prismaSchema = fs.readFileSync(
      path.join(repositoryRoot, 'packages/prisma/prisma/schema.prisma'),
      'utf8',
    );
    const credentialPlatforms = readEnumBlock(
      prismaSchema,
      'CredentialPlatform',
    )
      .split(/\s+/)
      .filter(Boolean);
    const platformGuide = readIntegrationDoc('publishing-and-channels.mdx');

    for (const platform of credentialPlatforms) {
      expect(platformGuide, platform).toContain(`\`${platform}\``);
    }
  });
});

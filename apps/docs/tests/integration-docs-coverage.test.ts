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
  it('documents every server integration directory', () => {
    const serverIntegrationDirectory = path.join(
      repositoryRoot,
      'apps/server/api/src/services/integrations',
    );
    const adapterDirectories = fs
      .readdirSync(serverIntegrationDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const inventory = readIntegrationDoc('runtime-adapters.mdx');

    for (const directory of adapterDirectories) {
      expect(inventory, directory).toContain(`\`${directory}\``);
    }
  });

  it('documents every organization BYOK provider key', () => {
    const enumSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'packages/contracts/src/enums/byok-provider.enum.ts',
      ),
      'utf8',
    );
    const providerKeys = [...enumSource.matchAll(/= '([^']+)'/g)].map(
      (match) => match[1],
    );
    const providerGuide = readIntegrationDoc('ai-providers.mdx');

    for (const providerKey of providerKeys) {
      expect(providerGuide, providerKey).toContain(`\`${providerKey}\``);
    }
  });

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

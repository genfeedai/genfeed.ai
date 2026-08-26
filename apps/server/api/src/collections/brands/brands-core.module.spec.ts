import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const coreSource = readFileSync(join(here, 'brands-core.module.ts'), 'utf8');
const fatSource = readFileSync(join(here, 'brands.module.ts'), 'utf8');

describe('BrandsCoreModule DI leaf', () => {
  it('does not construct MasterPromptGeneratorService (needs Credits/Models/Replicate)', () => {
    expect(coreSource).not.toContain('MasterPromptGeneratorService');
    expect(fatSource).toContain('MasterPromptGeneratorService');
    expect(fatSource).toContain('CreditsModule');
    expect(fatSource).toContain('ModelsModule');
    expect(fatSource).toContain('ReplicateModule');
  });

  it('does not construct BrandPersistenceService (needs Links/Organizations)', () => {
    expect(coreSource).not.toContain('BrandPersistenceService');
    expect(fatSource).toContain('BrandPersistenceService');
    expect(fatSource).toContain('LinksModule');
    expect(fatSource).toContain('OrganizationsModule');
  });

  it('owns and exports the Redis-only Brand OS preview boundary', () => {
    expect(coreSource).toContain('BrandOsPreviewService');
    expect(coreSource).toMatch(/exports:\s*\[[\s\S]*BrandOsPreviewService/);
    expect(coreSource).toMatch(/providers:\s*\[[\s\S]*BrandOsPreviewService/);
  });
});

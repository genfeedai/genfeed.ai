import { SkillsProRegistryEntrySerializer } from '@serializers/server/skills-pro/skills-pro-registry-entry.serializer';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/helpers',
  async () => import('../../helpers/src/serializer.helper'),
);

describe('SkillsProRegistryEntrySerializer', () => {
  it('snapshots the metadata-only registry contract', () => {
    const output = SkillsProRegistryEntrySerializer.serialize({
      body: '# Private skill body',
      category: 'generation',
      checksum: 'sha256:private',
      description: 'Generate images with reviewed production defaults.',
      downloadUrl: 'https://private.example.test/download',
      id: 'image-gen-pro',
      name: 'Image Gen Pro',
      s3Key: 'artifacts/skills/v1/image-gen-pro/skill.zip',
      slug: 'image-gen-pro',
      version: '1.2.0',
    });

    expect(output).toMatchInlineSnapshot(`
      {
        "data": {
          "attributes": {
            "category": "generation",
            "description": "Generate images with reviewed production defaults.",
            "name": "Image Gen Pro",
            "slug": "image-gen-pro",
            "version": "1.2.0",
          },
          "id": "image-gen-pro",
          "type": "skills-pro-registry-entry",
        },
      }
    `);

    const serialized = JSON.stringify(output);
    for (const forbiddenField of [
      'body',
      'checksum',
      'downloadUrl',
      's3Key',
      'storageKey',
    ]) {
      expect(serialized).not.toContain(forbiddenField);
    }
  });
});

import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  type BrandedPostMaterialRecord,
  bindBrandedPostMaterialLayout,
  describeBrandedPostMaterialLayout,
} from '@api/services/branded-generation-receipts/branded-generation-post-material.util';
import {
  IngredientCategory,
  Platform,
  PostCategory,
  PostFormat,
} from '@genfeedai/contracts';

const actor = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  actorId: 'user-a',
};
const bytesHash = `sha256:${'a'.repeat(64)}`;
function post(): BrandedPostMaterialRecord {
  return {
    id: 'post-a',
    organizationId: actor.organizationId,
    brandId: actor.brandId,
    isDeleted: false,
    parentId: null,
    order: 0,
    platform: Platform.TWITTER,
    credentialId: 'credential-a',
    targetAttachments: [],
    targetSettings: {},
    category: PostCategory.TEXT,
    format: PostFormat.STANDARD,
    description: 'A complete original caption.',
    ingredients: [],
    children: [],
  };
}
function image(
  id = 'image-a',
): BrandedPostMaterialRecord['ingredients'][number] {
  return {
    id,
    organizationId: actor.organizationId,
    brandId: actor.brandId,
    isDeleted: false,
    category: IngredientCategory.IMAGE,
    s3Key: `images/${id}`,
    version: 1,
    mimeType: 'image/png',
    fileSize: 5,
    cdnUrl: `https://example.test/${id}`,
  };
}
function binding(record: BrandedPostMaterialRecord) {
  const layout = describeBrandedPostMaterialLayout(actor, record);
  return bindBrandedPostMaterialLayout(
    layout,
    layout.entries.map((entry) => ({
      id: entry.id,
      role: entry.role,
      version: entry.kind === 'text' ? entry.version : 's3:version-a',
      contentHash: entry.kind === 'text' ? entry.contentHash : bytesHash,
    })),
  );
}

describe('complete canonical post material', () => {
  it('preserves the existing text-only artifact identity', () => {
    const record = post();
    expect(binding(record)).toMatchObject({
      textHash: hashBrandedGenerationTextV1(record.description),
      artifact: {
        version: hashBrandedGenerationTextV1(record.description),
        mediaKind: 'text',
        parts: [],
      },
    });
  });

  it('binds caption, media membership, storage version and metadata changes', () => {
    const record = post();
    record.category = PostCategory.IMAGE;
    record.ingredients = [image()];
    const original = binding(record);
    record.description += ' edited';
    expect(binding(record).artifact.version).not.toBe(
      original.artifact.version,
    );
    record.description = post().description;
    record.ingredients[0].version += 1;
    expect(binding(record).artifact.version).not.toBe(
      original.artifact.version,
    );
    record.ingredients[0].version = 1;
    const layout = describeBrandedPostMaterialLayout(actor, record);
    const changed = bindBrandedPostMaterialLayout(layout, [
      {
        ...original.artifact.parts[0],
        version: 's3:version-b',
      },
    ]);
    expect(changed.artifact.version).not.toBe(original.artifact.version);
    record.ingredients.push(image('image-b'));
    expect(describeBrandedPostMaterialLayout(actor, record).format).toBe(
      'carousel',
    );
    expect(binding(record).artifact.version).not.toBe(
      original.artifact.version,
    );
  });

  it('binds ordered thread segments, including reuse of one image in two segments', () => {
    const record = post();
    record.format = PostFormat.THREAD;
    record.ingredients = [image()];
    record.children = [
      {
        ...post(),
        id: 'child-a',
        parentId: record.id,
        order: 1,
        ingredients: [image()],
        children: [],
      },
      { ...post(), id: 'child-b', parentId: record.id, order: 2, children: [] },
    ];
    const original = binding(record);
    expect(original.artifact.parts.map((part) => part.role)).toEqual([
      'image',
      'text',
      'text',
    ]);
    record.children[0].order = 3;
    expect(binding(record).artifact.version).not.toBe(
      original.artifact.version,
    );
    record.children[0].order = 1;
    record.children[1].description = 'Changed ending';
    expect(binding(record).artifact.version).not.toBe(
      original.artifact.version,
    );
  });

  it('binds explicit attachment order and settings, and holds attachments without scoped bytes', () => {
    const record = post();
    record.ingredients = [image('image-a'), image('image-b')];
    record.targetAttachments = record.ingredients.map((item) => item.cdnUrl);
    const original = binding(record);
    record.targetAttachments = [...record.targetAttachments].reverse();
    expect(binding(record).artifact.parts.map((part) => part.id)).toEqual([
      'images/image-b',
      'images/image-a',
    ]);
    expect(binding(record).artifact.version).not.toBe(
      original.artifact.version,
    );
    record.targetSettings = { crop: 'square' };
    expect(binding(record).artifact.version).not.toBe(
      original.artifact.version,
    );
    record.targetAttachments = [
      'https://foreign.test/a',
      'https://foreign.test/b',
    ];
    expect(() => binding(record)).toThrow('receipt_artifact_unsupported');
  });

  it.each([
    'organization',
    'brand',
    'deleted',
    'unsupported',
    'missing_key',
  ] as const)('rejects an invalid attached ingredient (%s)', (reason) => {
    const record = post();
    record.ingredients = [image()];
    const item = record.ingredients[0];
    if (reason === 'organization') item.organizationId = 'foreign';
    if (reason === 'brand') item.brandId = 'foreign';
    if (reason === 'deleted') item.isDeleted = true;
    if (reason === 'unsupported') item.category = IngredientCategory.AUDIO;
    if (reason === 'missing_key') item.s3Key = null;
    expect(() => binding(record)).toThrow('receipt_artifact_unsupported');
  });

  it.each([
    'foreign',
    'account',
    'parent',
    'nested',
    'duplicate_order',
  ] as const)(
    'rejects incomplete or foreign thread membership (%s)',
    (reason) => {
      const record = post();
      record.children = [
        {
          ...post(),
          id: 'child-a',
          parentId: record.id,
          order: 1,
          children: [],
        },
        {
          ...post(),
          id: 'child-b',
          parentId: record.id,
          order: 2,
          children: [],
        },
      ];
      const child = record.children[0];
      if (reason === 'foreign') child.brandId = 'foreign';
      if (reason === 'account') child.credentialId = 'foreign';
      if (reason === 'parent') child.parentId = 'foreign';
      if (reason === 'nested') child.children = [{ id: 'grandchild' }];
      if (reason === 'duplicate_order') child.order = 2;
      expect(() => binding(record)).toThrow('receipt_artifact_unsupported');
    },
  );

  it('rejects omitted or relabeled material parts instead of certifying a caption alone', () => {
    const record = post();
    record.ingredients = [image()];
    const layout = describeBrandedPostMaterialLayout(actor, record);
    expect(() => bindBrandedPostMaterialLayout(layout, [])).toThrow(
      'receipt_artifact_version_mismatch',
    );
    expect(() =>
      bindBrandedPostMaterialLayout(layout, [
        {
          id: 'images/image-a',
          role: 'video',
          version: 'version',
          contentHash: bytesHash,
        },
      ]),
    ).toThrow('receipt_artifact_version_mismatch');
  });

  it('holds a complete shape above the existing material bound rather than truncating it', () => {
    const record = post();
    record.children = Array.from({ length: 9 }, (_, index) => ({
      ...post(),
      id: `child-${index}`,
      parentId: record.id,
      order: index + 1,
      children: [],
    }));
    expect(() => binding(record)).toThrow('receipt_artifact_unsupported');
  });
});

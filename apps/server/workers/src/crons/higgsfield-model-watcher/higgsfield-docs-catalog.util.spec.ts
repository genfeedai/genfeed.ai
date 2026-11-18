import { ModelCategory } from '@genfeedai/contracts';
import {
  extractFamilyUrls,
  extractWorkflowUrls,
  parseWorkflowPage,
} from '@workers/crons/higgsfield-model-watcher/higgsfield-docs-catalog.util';
import { describe, expect, it } from 'vitest';

const VIDEO_INDEX = `
[HiggsfieldVideo · 3 workflows
Genjutsu
View API reference →](https://docs.higgsfield.ai/docs/models/genjutsu.md)

[KlingVideo · 8 workflows
Kling 3.0
View API reference →](https://docs.higgsfield.ai/docs/models/kling-3.md)

- [Model API Reference](https://docs.higgsfield.ai/docs/models.md)
- [Wan 2.7 — Reference to video API](https://docs.higgsfield.ai/docs/models/wan-2-7/reference-to-video.md)
- [Image catalog](https://docs.higgsfield.ai/docs/models/image-generation.md)
- [Genjutsu again](https://docs.higgsfield.ai/docs/models/genjutsu.md)
`;

const GENJUTSU_FAMILY = `
| [Motion transfer](https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md) | \`POST /higgsfield/genjutsu/motion-transfer/v1.0\` |
| [Restyle](https://docs.higgsfield.ai/docs/models/genjutsu/restyle.md) | \`POST /higgsfield/genjutsu/restyle/v1.0\` |
- [Restyle again](https://docs.higgsfield.ai/docs/models/genjutsu/restyle.md)
- [Genjutsu](https://docs.higgsfield.ai/docs/models/genjutsu.md)
`;

describe('extractFamilyUrls', () => {
  it('lists each family page once and skips the catalog index pages', () => {
    expect(extractFamilyUrls(VIDEO_INDEX)).toEqual([
      'https://docs.higgsfield.ai/docs/models/genjutsu.md',
      'https://docs.higgsfield.ai/docs/models/kling-3.md',
    ]);
  });
});

describe('extractWorkflowUrls', () => {
  it('lists each workflow page once and ignores family links', () => {
    expect(extractWorkflowUrls(GENJUTSU_FAMILY)).toEqual([
      'https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer.md',
      'https://docs.higgsfield.ai/docs/models/genjutsu/restyle.md',
    ]);
  });
});

describe('parseWorkflowPage', () => {
  const sourceUrl = 'https://docs.higgsfield.ai/docs/models/x/y.md';

  it.each([
    {
      category: ModelCategory.VIDEO,
      endpoint: 'higgsfield/genjutsu/restyle/v1.0',
      expectedCategory: ModelCategory.VIDEO,
      expectedLabel: 'Genjutsu Restyle',
      markdown:
        '# Genjutsu — Restyle API\n\n**Endpoint:** `POST https://api.higgsfield.ai/higgsfield/genjutsu/restyle/v1.0`\n\n**Endpoint ID:** `higgsfield/genjutsu/restyle/v1.0`\n',
    },
    {
      category: ModelCategory.VIDEO,
      endpoint: 'bytedance/seedance-2.5/video-edit',
      expectedCategory: ModelCategory.VIDEO_EDIT,
      expectedLabel: 'Seedance 2.5 Video edit',
      markdown:
        '# Seedance 2.5 — Video edit API\n\n**Endpoint ID:** `bytedance/seedance-2.5/video-edit`\n',
    },
    {
      category: ModelCategory.VIDEO,
      endpoint: 'bytedance/seedance-2.5/video-extend',
      expectedCategory: ModelCategory.VIDEO,
      expectedLabel: 'Seedance 2.5 Video extend',
      markdown:
        '# Seedance 2.5 — Video extend API\n\n**Endpoint ID:** `bytedance/seedance-2.5/video-extend`\n',
    },
    {
      category: ModelCategory.IMAGE,
      endpoint: 'alibaba/qwen-image-3/edit',
      expectedCategory: ModelCategory.IMAGE_EDIT,
      expectedLabel: 'Qwen Image 3 Edit images',
      markdown:
        '# Qwen Image 3 — Edit images API\n\n**Endpoint ID:** `alibaba/qwen-image-3/edit`\n',
    },
    {
      category: ModelCategory.IMAGE,
      endpoint: 'higgsfield-ai/soul/v2/standard',
      expectedCategory: ModelCategory.IMAGE,
      expectedLabel: 'SOUL V2 Text to image',
      markdown:
        '# SOUL V2 — Text to image API\n\n**Endpoint ID:** `higgsfield-ai/soul/v2/standard`\n',
    },
  ] as const)(
    'reads $endpoint as $expectedCategory',
    ({ category, endpoint, expectedCategory, expectedLabel, markdown }) => {
      expect(parseWorkflowPage(markdown, sourceUrl, category)).toEqual({
        category: expectedCategory,
        endpoint,
        label: expectedLabel,
        sourceUrl,
      });
    },
  );

  it('returns null for Soul ID, which is a training workflow with no endpoint id', () => {
    const markdown =
      '# Soul ID — Create character API\n\n**Endpoint:** `POST https://api.higgsfield.ai/v1/custom-references`\n\n**Catalog ID:** `soul-id`\n';

    expect(parseWorkflowPage(markdown, sourceUrl, ModelCategory.IMAGE)).toBe(
      null,
    );
  });
});

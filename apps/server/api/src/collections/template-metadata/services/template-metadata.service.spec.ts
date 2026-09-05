import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import { describe, expect, it, vi } from 'vitest';

describe('TemplateMetadataService.update', () => {
  it('merges config-backed fields without dropping saved metadata', async () => {
    const existing = {
      id: 'metadata-1',
      templateId: 'template-1',
      author: 'Original',
      data: { difficulty: 'beginner', estimatedTime: 10, custom: true },
    };
    const update = vi
      .fn()
      .mockImplementation(async ({ data }) => ({ ...existing, ...data }));
    const service = new TemplateMetadataService({
      templateMetadata: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update,
      },
    } as never);
    const result = await service.update('template-1', {
      goals: ['educate'],
      author: 'New',
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'metadata-1' },
      data: {
        author: 'New',
        data: { ...existing.data, goals: ['educate'] },
      },
    });
    expect(result).toMatchObject({
      goals: ['educate'],
      estimatedTime: 10,
      author: 'New',
    });
  });
  it('uses the supplied transaction for metadata creation and updates', async () => {
    const saved = { id: 'metadata-1', templateId: 'template-1', data: {} };
    const root = {
      templateMetadata: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    const tx = {
      templateMetadata: {
        create: vi.fn().mockResolvedValue(saved),
        findFirst: vi.fn().mockResolvedValue(saved),
        update: vi.fn().mockResolvedValue(saved),
      },
    };
    const service = new TemplateMetadataService(root as never);
    await service.create('template-1', { author: 'Author' }, tx as never);
    await service.update('template-1', { author: 'Editor' }, tx as never);
    expect(tx.templateMetadata.create).toHaveBeenCalled();
    expect(tx.templateMetadata.findFirst).toHaveBeenCalled();
    expect(tx.templateMetadata.update).toHaveBeenCalled();
    expect(root.templateMetadata.create).not.toHaveBeenCalled();
    expect(root.templateMetadata.findFirst).not.toHaveBeenCalled();
    expect(root.templateMetadata.update).not.toHaveBeenCalled();
  });
});

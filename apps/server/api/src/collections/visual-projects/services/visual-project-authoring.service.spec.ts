import { VisualProjectAuthoringService } from '@api/collections/visual-projects/services/visual-project-authoring.service';
import type { VisualRevision } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const revision = {
  id: 'revision',
  organizationId: 'org',
  brandId: 'brand',
  userId: 'user',
  modelKey: 'model',
  prompt: 'A launch card',
  props: {},
  settings: { durationFrames: 30, fps: 30 },
  sourceAssetIds: [],
  sourceCode: null,
} as unknown as VisualRevision;

function fixture(faces: unknown[]) {
  const approvedFonts = vi
    .fn()
    .mockResolvedValue(
      faces.map((face) => ({ assetId: 'font', faces: [face] })),
    );
  const service = new VisualProjectAuthoringService(
    {} as never,
    {
      brand: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ label: 'Example Co' }),
      },
    } as never,
    { approvedFonts } as never,
  );
  return { approvedFonts, service };
}

describe('authoring with brand fonts', () => {
  it('tells the model which approved families the renderer has loaded', async () => {
    const face = { family: 'Brand Display', style: 'normal', weight: 700 };
    const { approvedFonts, service } = fixture([face]);
    const params = await service.authorParameters(revision, []);
    const [system, user] = params.messages;
    expect(approvedFonts).toHaveBeenCalledWith({
      organizationId: 'org',
      brandId: 'brand',
      userId: 'user',
    });
    expect(String(system.content)).toContain(
      'Approved brand fonts listed in brandFonts are already loaded',
    );
    expect(JSON.parse(String(user.content)).brandFonts).toBe(
      JSON.stringify([face]),
    );
  });

  it('lists no fonts for a brand without approved ones', async () => {
    const { service } = fixture([]);
    const params = await service.authorParameters(revision, []);
    expect(JSON.parse(String(params.messages[1].content)).brandFonts).toBe(
      '[]',
    );
  });
});

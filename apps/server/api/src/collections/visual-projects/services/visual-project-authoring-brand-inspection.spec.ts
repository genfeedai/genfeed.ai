import { VisualProjectAuthoringService } from '@api/collections/visual-projects/services/visual-project-authoring.service';
import type { IVisualSandboxMedia } from '@genfeedai/contracts/interfaces';
import type { VisualRevision } from '@genfeedai/prisma';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

const revision = {
  id: 'revision',
  organizationId: 'org',
  brandId: 'brand',
  userId: 'user',
  modelKey: 'model',
  sourceAssetIds: [],
} as unknown as VisualRevision;

async function solidFrame(color: string): Promise<IVisualSandboxMedia> {
  const bytes = await sharp({
    create: { width: 64, height: 64, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  return {
    format: 'png',
    width: 64,
    height: 64,
    bytes: bytes.toString('base64'),
  };
}
const frames = async (color: string) =>
  Promise.all([solidFrame(color), solidFrame(color), solidFrame(color)]);

const logo = {
  assetId: 'brand-logo',
  mime: 'image/png',
  bytes: Buffer.from('logo').toString('base64'),
};
function serviceWith(brief: unknown) {
  return new VisualProjectAuthoringService(
    {} as never,
    {} as never,
    {} as never,
    { inspectionBrief: vi.fn().mockResolvedValue(brief) } as never,
  );
}
const response = (verdict: object) =>
  ({
    choices: [{ message: { content: JSON.stringify(verdict) } }],
  }) as never;
const brief = {
  paletteRoles: [{ role: 'Primary', color: '#112233', isRequired: true }],
  requiredLogo: logo,
};

describe('brand frame inspection', () => {
  it('sends the required logo as the last image and asks whether it appears', async () => {
    const service = serviceWith(brief);
    const media = await frames('#112233');
    const brand = await service.brandInspection(revision, media);
    const params = await service.inspectionParameters(revision, media, brand);
    const content = params.messages[0].content as {
      type: string;
      text?: string;
      image_url?: { url: string };
    }[];
    expect(content.filter((part) => part.type === 'image_url')).toHaveLength(4);
    expect(content.at(-1)?.image_url?.url).toBe(
      `data:image/png;base64,${logo.bytes}`,
    );
    expect(content[0].text).toContain('isLogoVisible');
  });

  it('inspects an unbranded render exactly as before', async () => {
    const service = serviceWith(null);
    const media = await frames('#2EC4B6');
    const brand = await service.brandInspection(revision, media);
    const params = await service.inspectionParameters(revision, media, brand);
    const content = params.messages[0].content as {
      type: string;
      text?: string;
    }[];
    expect(content).toHaveLength(4);
    expect(content[0].text).not.toContain('isLogoVisible');
    expect(
      service.parseInspection(
        response({ isAccepted: true, issues: [] }),
        brand,
      ),
    ).toEqual({
      isAccepted: true,
      issues: [],
      brandChecks: { palette: 'not_checked', logo: 'not_checked' },
    });
  });

  it('rejects frames with a dominant colour outside the palette, naming it', async () => {
    const service = serviceWith(brief);
    const brand = await service.brandInspection(
      revision,
      await frames('#2EC4B6'),
    );
    const result = service.parseInspection(
      response({ isAccepted: true, issues: [], isLogoVisible: true }),
      brand,
    );
    expect(result.isAccepted).toBe(false);
    expect(result.issues[0]).toContain('#2EC4B6');
    expect(result.brandChecks).toEqual({ palette: 'failed', logo: 'passed' });
  });

  it('rejects frames that omit a required, staged logo', async () => {
    const service = serviceWith(brief);
    const brand = await service.brandInspection(
      revision,
      await frames('#112233'),
    );
    const result = service.parseInspection(
      response({
        isAccepted: true,
        issues: ['Text is cropped'],
        isLogoVisible: false,
      }),
      brand,
    );
    expect(result).toEqual({
      isAccepted: false,
      issues: [
        'The required brand logo does not appear in the first, middle or last frame.',
        'Text is cropped',
      ],
      brandChecks: { palette: 'passed', logo: 'failed' },
    });
  });

  it('accepts on-brand frames and records both checks as passed', async () => {
    const service = serviceWith(brief);
    const brand = await service.brandInspection(
      revision,
      await frames('#112233'),
    );
    expect(
      service.parseInspection(
        response({ isAccepted: true, issues: [], isLogoVisible: true }),
        brand,
      ),
    ).toEqual({
      isAccepted: true,
      issues: [],
      brandChecks: { palette: 'passed', logo: 'passed' },
    });
  });

  it('does not reject on a logo answer it cannot read, and records it as not checked', async () => {
    const service = serviceWith(brief);
    const brand = await service.brandInspection(
      revision,
      await frames('#112233'),
    );
    const result = service.parseInspection(
      response({ isAccepted: true, issues: [], isLogoVisible: null }),
      brand,
    );
    expect(result.isAccepted).toBe(true);
    expect(result.brandChecks?.logo).toBe('not_checked');
  });

  it('keeps the model verdict when it already rejects the render', async () => {
    const service = serviceWith(null);
    const brand = await service.brandInspection(
      revision,
      await frames('#112233'),
    );
    expect(
      service.parseInspection(
        response({ isAccepted: false, issues: ['Overlapping text'] }),
        brand,
      ).isAccepted,
    ).toBe(false);
  });
});

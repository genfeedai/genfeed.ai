import { StoryboardReferenceAnalysisService } from '@api/collections/content-runs/services/storyboard-reference-analysis.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { IMediaPerception } from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

interface Part {
  image_url?: { url: string };
  text?: string;
  type: string;
}

const style = {
  label: 'Warm studio',
  palette: ['cream'],
  lighting: 'soft',
  lens: 'normal',
  grade: 'grain',
  typography: '',
};

const videoAnalysis = {
  title: 'Reel',
  logline: '',
  style,
  shots: [],
};

const request = {
  assetId: 'video-1',
  brandId: 'brand-1',
  organizationId: 'org-1',
  planBudgetSeconds: null,
  supportedDurationsSeconds: [4, 6, 8],
};

function perception(overrides: Partial<IMediaPerception> = {}) {
  return {
    framesStatus: 'ready',
    frames: [
      { index: 0, timestampSeconds: 1, url: 'https://cdn/f0.jpg' },
      { index: 1, timestampSeconds: 5, url: 'https://cdn/f1.jpg' },
    ],
    ocrStatus: 'ready',
    ocr: [
      { frameIndex: 1, text: 'Day 1' },
      { frameIndex: 0, text: '' },
    ],
    transcriptStatus: 'ready',
    transcript: { text: 'Breathe in and slide.', language: 'en' },
    description: { summary: 'A woman on a reformer.' },
    ...overrides,
  } as unknown as IMediaPerception;
}

function setup(
  options: {
    asset?: Record<string, unknown> | null;
    duration?: number;
    stored?: IMediaPerception | null;
    answer?: unknown;
  } = {},
) {
  const asset =
    options.asset === undefined
      ? {
          category: 'VIDEO',
          cdnUrl: 'https://cdn/reference.mp4',
          sourceActionId: null,
        }
      : options.asset;
  const calls: Array<{ messages: Array<{ content: string | Part[] }> }> = [];
  const thumbnails: number[] = [];
  const llm = {
    completeStructured: vi.fn(async (params: (typeof calls)[number]) => {
      calls.push(params);
      return options.answer ?? videoAnalysis;
    }),
  };
  const service = new StoryboardReferenceAnalysisService(
    { ingredient: { findFirst: vi.fn(async () => asset) } } as never,
    { buildUrl: (key: string) => `https://cdn/${key}` } as never,
    {
      probeMediaFromUrl: vi.fn(async () => ({
        durationSeconds: options.duration ?? 14.2,
        sizeBytes: 1_000_000,
      })),
      generateThumbnail: vi.fn(
        async (_url: string, id: string, seconds: number) => {
          thumbnails.push(seconds);
          return { ingredientId: id, thumbnailUrl: `https://cdn/${id}.jpg` };
        },
      ),
    } as never,
    {
      getForAsset: vi.fn(async () =>
        options.stored === undefined ? null : options.stored,
      ),
    } as never,
    llm as never,
    { error: vi.fn() } as never,
  );
  const user = () => calls[0].messages[1].content as Part[];
  const system = () => calls[0].messages[0].content as string;
  return { service, user, system, thumbnails, llm };
}

describe('StoryboardReferenceAnalysisService', () => {
  it('shows the model the stored frames, text on screen and transcript, and samples nothing', async () => {
    const { service, user, thumbnails } = setup({ stored: perception() });
    const result = await service.analyse(request);
    expect(result).toEqual({
      kind: 'video',
      runtimeBudgetSeconds: 30,
      analysis: videoAnalysis,
    });
    expect(thumbnails).toEqual([]);
    const [context, ...frames] = user();
    expect(JSON.parse(context.text ?? '')).toEqual({
      durationSeconds: 14.2,
      kind: 'video',
      onScreenText: [{ atSeconds: 5, text: 'Day 1' }],
      summary: 'A woman on a reformer.',
      transcript: 'Breathe in and slide.',
    });
    expect(
      frames
        .filter((part) => part.type === 'image_url')
        .map((part) => part.image_url?.url),
    ).toEqual(['https://cdn/f0.jpg', 'https://cdn/f1.jpg']);
  });

  it('samples eight frames evenly when the video was not perceived', async () => {
    const { service, user, thumbnails } = setup({ stored: null });
    await service.analyse(request);
    expect(thumbnails).toEqual([
      0.89, 2.66, 4.44, 6.21, 7.99, 9.76, 11.54, 13.31,
    ]);
    const [context] = user();
    expect(JSON.parse(context.text ?? '').onScreenText).toEqual([]);
    expect(user().filter((part) => part.type === 'image_url')).toHaveLength(8);
  });

  it('tells the model how many shots fit the runtime', async () => {
    const { service, system } = setup({ stored: null });
    await service.analyse({ ...request, planBudgetSeconds: 20 });
    expect(system()).toContain('Return 2-5 shots in playback order');
    expect(system()).toContain('at most 20 seconds');
  });

  it('lets a longer reference set the runtime', async () => {
    const { service, system } = setup({ stored: null, duration: 44.1 });
    const result = await service.analyse({ ...request, planBudgetSeconds: 20 });
    expect(result).toMatchObject({ runtimeBudgetSeconds: 45 });
    expect(system()).toContain('Return 2-11 shots in playback order');
  });

  it('reads a still image as its own frame', async () => {
    const answer = {
      title: 'Portrait',
      style,
      composition: 'Left third.',
      referenceRoles: [],
      overlays: [],
      prompt: 'A portrait.',
    };
    const { service, user, system } = setup({
      asset: { category: 'IMAGE', cdnUrl: 'https://cdn/ref.jpg' },
      answer,
    });
    const result = await service.analyse({ ...request, assetId: 'image-1' });
    expect(result).toEqual({ kind: 'image', analysis: answer });
    expect(
      user()
        .filter((part) => part.type === 'image_url')
        .map((part) => part.image_url?.url),
    ).toEqual(['https://cdn/ref.jpg']);
    expect(system()).toContain('one prompt for an original recreation');
  });

  it('refuses a video longer than a minute', async () => {
    const { service } = setup({ duration: 61 });
    await expect(service.analyse(request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    ['missing', null],
    [
      'an imported remix source',
      {
        category: 'VIDEO',
        cdnUrl: 'https://cdn/x.mp4',
        sourceActionId: 'remix-source:1',
      },
    ],
  ])('refuses %s asset', async (_name, asset) => {
    const { service } = setup({ asset });
    await expect(service.analyse(request)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('answers a retryable error when the model reply cannot be used', async () => {
    const { service, llm } = setup({ stored: null });
    llm.completeStructured.mockRejectedValueOnce(new Error('bad json'));
    await expect(service.analyse(request)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

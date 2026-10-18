import { describe, expect, it } from 'vitest';
import {
  buildGenerationsCsv,
  readDirectives,
  toGenerationView,
  toPromptView,
} from './generation-view';

describe('toGenerationView', () => {
  it('reads a generated image with its prompts, owner, cost and aspect ratio', () => {
    const view = toGenerationView({
      category: 'IMAGE',
      cdnUrl: 'https://cdn.example/a.png',
      createdAt: '2026-10-18T07:25:00.000Z',
      generationCredits: 217,
      generationPrompt: 'compiled',
      id: 'ing-1',
      metadata: { height: 1080, width: 1920 },
      modelUsed: 'google/nano-banana-2-lite',
      organization: { id: 'org-1', label: 'Demo' },
      prompt: { enhanced: 'enhanced', original: 'original' },
      status: 'GENERATED',
      user: { email: 'vincent@genfeed.ai' },
    });

    expect(view).toMatchObject({
      compiled: 'compiled',
      credits: 217,
      enhanced: 'enhanced',
      id: 'ing-1',
      kind: 'generation',
      mediaKind: 'image',
      mediaUrl: 'https://cdn.example/a.png',
      model: 'google/nano-banana-2-lite',
      organizationLabel: 'Demo',
      original: 'original',
      status: 'GENERATED',
      userLabel: 'vincent@genfeed.ai',
    });
    expect(view.aspectRatio).toBeCloseTo(16 / 9);
  });

  it('keeps a failed generation with its error and no media', () => {
    const view = toGenerationView({
      category: 'VIDEO',
      generationError: 'provider timed out',
      id: 'ing-2',
      status: 'FAILED',
    });

    expect(view).toMatchObject({
      aspectRatio: 1,
      credits: null,
      error: 'provider timed out',
      mediaKind: 'none',
      mediaUrl: '',
    });
  });

  it('clamps extreme aspect ratios and falls back for an id-only owner', () => {
    expect(
      toGenerationView({ height: 100, id: 'a', width: 5000 }).aspectRatio,
    ).toBe(2.4);
    expect(
      toGenerationView({ id: 'a', organization: 'org-9', user: 'user-9' }),
    ).toMatchObject({ organizationLabel: 'org-9', userLabel: 'user-9' });
  });

  it('tells video and audio results from images', () => {
    expect(
      toGenerationView({
        category: 'VIDEO',
        cdnUrl: 'https://x/v.mp4',
        id: 'v',
      }).mediaKind,
    ).toBe('video');
    expect(
      toGenerationView({
        category: 'MUSIC',
        cdnUrl: 'https://x/m.mp3',
        id: 'm',
      }).mediaKind,
    ).toBe('audio');
  });
});

describe('toPromptView', () => {
  it('is a placeholder-thumbnail row with no media', () => {
    expect(
      toPromptView({
        id: 'p-1',
        original: 'a cat',
        status: 'DRAFT',
        user: { email: 'a@b.co' },
      }),
    ).toMatchObject({
      kind: 'prompt',
      mediaKind: 'none',
      original: 'a cat',
      userLabel: 'a@b.co',
    });
  });
});

describe('readDirectives', () => {
  it('turns the stored harness receipt into readable lines', () => {
    expect(
      readDirectives({
        appliedPacks: [{ id: 'tone', version: '1.2.0' }],
        brandId: 'brand-1',
        brandMode: 'strict',
        knowledgeReceipts: [{}, {}],
        source: 'brand',
        status: 'applied',
      }),
    ).toEqual([
      'Enhancement: applied',
      'Brand mode: strict',
      'Source: brand',
      'Brand: brand-1',
      'Packs: tone@1.2.0',
      'Knowledge sources: 2',
    ]);
  });

  it('is empty without a receipt', () => {
    expect(readDirectives(null)).toEqual([]);
    expect(readDirectives('nope')).toEqual([]);
  });
});

describe('buildGenerationsCsv', () => {
  it('quotes commas and quotes and neutralizes spreadsheet formulas', () => {
    const csv = buildGenerationsCsv([
      {
        ...toPromptView({ id: 'p-1', original: '=SUM(1,2) "x"' }),
        credits: 3,
      },
    ]);
    const [header, row] = csv.split('\n');

    expect(header.startsWith('id,kind,status')).toBe(true);
    expect(row).toContain('"\'=SUM(1,2) ""x"""');
    expect(row.startsWith('p-1,prompt,')).toBe(true);
    expect(row).toContain(',3,');
  });
});

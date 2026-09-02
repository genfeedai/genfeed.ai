import { describe, expect, test } from 'vitest';
import { CredentialPlatform } from '../../src';
import {
  getChannelTextPolicy,
  repurposePostContent,
} from '../../src/api-types/contracts/channel-repurpose.contract';

function longCaption(sentences: number): string {
  const filler = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed';
  return Array.from(
    { length: sentences },
    (_, index) => `Sentence number ${index + 1} carries ${filler}.`,
  ).join(' ');
}

describe('repurposePostContent caption transform', () => {
  test('keeps a caption that already fits without adjustments', () => {
    const outcome = repurposePostContent({
      caption: 'Short and sweet update.',
      targetPlatform: CredentialPlatform.TWITTER,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.caption).toBe('Short and sweet update.');
    expect(outcome.adjustments).toEqual([]);
  });

  test('truncates an over-limit caption at a word boundary with an ellipsis', () => {
    const caption = `Launch update ${'growth '.repeat(60)}metrics`;
    const outcome = repurposePostContent({
      caption,
      targetPlatform: CredentialPlatform.TWITTER,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(Array.from(outcome.caption).length).toBeLessThanOrEqual(280);
    expect(outcome.caption.endsWith('…')).toBe(true);
    // Word-boundary cut: the kept text is an exact prefix of the source and
    // the cut lands on whitespace, never inside a word.
    const keptText = outcome.caption.slice(0, -1);
    expect(caption.startsWith(keptText)).toBe(true);
    expect(caption[keptText.length]).toMatch(/\s/u);
    expect(outcome.adjustments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_repurpose.caption_truncated',
        }),
      ]),
    );
  });

  test('prefers a sentence boundary when one lands late enough in the budget', () => {
    const caption = longCaption(20);
    const outcome = repurposePostContent({
      caption,
      targetPlatform: CredentialPlatform.TWITTER,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.caption.endsWith('.')).toBe(true);
    expect(outcome.caption.endsWith('…')).toBe(false);
    expect(Array.from(outcome.caption).length).toBeLessThanOrEqual(280);
    expect(caption.startsWith(outcome.caption)).toBe(true);
  });

  test('never splits surrogate pairs when truncating emoji-heavy captions', () => {
    const caption = `Update ${'🚀'.repeat(400)}`;
    const outcome = repurposePostContent({
      caption,
      targetPlatform: CredentialPlatform.TWITTER,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(Array.from(outcome.caption).length).toBeLessThanOrEqual(280);
    // Round-trip through code points stays lossless — no lone surrogates.
    expect(outcome.caption).toBe(
      String.fromCodePoint(
        ...Array.from(outcome.caption).map(
          (char) => char.codePointAt(0) as number,
        ),
      ),
    );
  });

  test('produced captions always pass the target caption validation', () => {
    const outcome = repurposePostContent({
      caption: longCaption(40),
      targetPlatform: CredentialPlatform.TWITTER,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(
      outcome.validation.errors.filter(
        (issue) => issue.code === 'channel_target.caption_too_long',
      ),
    ).toEqual([]);
  });
});

describe('repurposePostContent hashtag policy', () => {
  test('keeps only the first allowed hashtags for X', () => {
    const outcome = repurposePostContent({
      caption: 'Big news #launch #startup #growth #ai #saas',
      targetPlatform: CredentialPlatform.TWITTER,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.caption).toContain('#launch');
    expect(outcome.caption).toContain('#startup');
    expect(outcome.caption).not.toContain('#growth');
    expect(outcome.caption).not.toContain('#ai');
    expect(outcome.caption).not.toContain('#saas');
    expect(outcome.adjustments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_repurpose.hashtags_trimmed',
        }),
      ]),
    );
  });

  test('keeps every hashtag when the target allows them all', () => {
    const caption = 'Big news #launch #startup #growth #ai #saas';
    const outcome = repurposePostContent({
      caption,
      targetPlatform: CredentialPlatform.INSTAGRAM,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.caption).toBe(caption);
    expect(outcome.adjustments).toEqual([]);
  });

  test('collapses leftover whitespace after removing inline hashtags', () => {
    const outcome = repurposePostContent({
      caption: 'We #shipped #fast #today and it works',
      targetPlatform: CredentialPlatform.TWITTER,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.caption).not.toMatch(/ {2,}/);
    expect(outcome.caption).not.toMatch(/\s[,.]/);
  });
});

describe('repurposePostContent link policy', () => {
  test('removes links for platforms without clickable caption links', () => {
    const outcome = repurposePostContent({
      caption: 'Read the deep dive https://genfeed.ai/blog/launch today',
      targetPlatform: CredentialPlatform.INSTAGRAM,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.caption).not.toContain('https://');
    expect(outcome.caption).toContain('Read the deep dive');
    expect(outcome.adjustments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_repurpose.links_removed',
        }),
      ]),
    );
  });

  test('keeps links for platforms with clickable captions', () => {
    const caption = 'Read the deep dive https://genfeed.ai/blog/launch today';
    const outcome = repurposePostContent({
      caption,
      targetPlatform: CredentialPlatform.LINKEDIN,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.caption).toBe(caption);
    expect(outcome.adjustments).toEqual([]);
  });
});

describe('repurposePostContent media compatibility', () => {
  test('rejects media kinds the target cannot publish with an actionable message', () => {
    const outcome = repurposePostContent({
      caption: 'Carousel recap',
      media: [{ kind: 'carousel' }],
      targetPlatform: CredentialPlatform.TWITTER,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.unsupported_media_kind',
          message: expect.stringContaining('carousel'),
        }),
      ]),
    );
  });

  test('rejects media counts beyond the target maximum', () => {
    const outcome = repurposePostContent({
      caption: 'Photo dump',
      media: Array.from({ length: 6 }, (_, index) => ({
        id: `asset-${index}`,
        kind: 'image' as const,
      })),
      targetPlatform: CredentialPlatform.TWITTER,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.too_many_media_items',
        }),
      ]),
    );
  });

  test('missing required media stays a draft-stage issue, not a rejection', () => {
    const outcome = repurposePostContent({
      caption: 'Video script only, media comes later',
      targetPlatform: CredentialPlatform.YOUTUBE,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'channel_target.media_required' }),
      ]),
    );
  });

  test('animated media on a flattening platform surfaces the consequence as a warning', () => {
    const outcome = repurposePostContent({
      caption: 'Motion teaser',
      media: [{ isAnimated: true, kind: 'image' }],
      targetPlatform: CredentialPlatform.INSTAGRAM,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.validation.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.animated_media_flattened',
        }),
      ]),
    );
  });
});

describe('repurposePostContent platform gating', () => {
  test('rejects platforms without a channel capability entry', () => {
    const outcome = repurposePostContent({
      caption: 'Server news',
      targetPlatform: CredentialPlatform.DISCORD,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors[0]?.message).toContain('discord');
  });

  test('rejects hidden channels with the catalog status message', () => {
    const outcome = repurposePostContent({
      caption: 'Page update',
      targetPlatform: CredentialPlatform.FACEBOOK,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'channel_target.hidden_channel' }),
      ]),
    );
  });
});

describe('getChannelTextPolicy', () => {
  test('exposes the per-platform hashtag and link policy', () => {
    expect(getChannelTextPolicy(CredentialPlatform.TWITTER)).toEqual(
      expect.objectContaining({ hasClickableLinks: true, maxHashtags: 2 }),
    );
    expect(getChannelTextPolicy(CredentialPlatform.INSTAGRAM)).toEqual(
      expect.objectContaining({ hasClickableLinks: false, maxHashtags: 30 }),
    );
  });
});

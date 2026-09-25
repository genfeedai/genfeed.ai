import {
  buildVoiceCorpus,
  buildVoiceEvidencePrompt,
  EMPTY_CORPUS_GUIDANCE,
  pickPromptSamples,
  pickRepresentativeExemplars,
  resolveVerbatimExemplars,
  selectVoiceCorpus,
  summarizeVoiceCorpus,
  toPastedCandidates,
  VOICE_CORPUS_MINIMUM_SAMPLES,
} from '@api/collections/brands/utils/brand-voice-corpus.util';
import type {
  BrandVoiceSampleKind,
  BrandVoiceSampleOrigin,
  IBrandVoiceCorpusCandidate,
} from '@genfeedai/contracts/interfaces';

function candidate(
  id: string,
  text: string,
  options: {
    daysAgo?: number;
    engagement?: number | null;
    kind?: BrandVoiceSampleKind;
    origin?: BrandVoiceSampleOrigin;
    platform?: string | null;
  } = {},
): IBrandVoiceCorpusCandidate {
  const daysAgo = options.daysAgo ?? 1;
  return {
    engagement: options.engagement === undefined ? null : options.engagement,
    id,
    kind: options.kind ?? 'original',
    origin: options.origin ?? 'own-account',
    platform: options.platform === undefined ? 'twitter' : options.platform,
    publishedAt: new Date(
      Date.UTC(2026, 8, 20) - daysAgo * 24 * 60 * 60 * 1000,
    ).toISOString(),
    text,
  };
}

describe('brand voice corpus selection', () => {
  it('dedupes normalized text and keeps the most authentic origin', () => {
    const selected = selectVoiceCorpus([
      candidate('post-1', 'Shipped it https://x.co/1', {
        origin: 'published-post',
      }),
      candidate('own-1', 'shipped   it'),
      candidate('own-2', '@someone shipped it', { kind: 'reply' }),
      candidate('own-3', 'https://only-a-link.example'),
    ]);

    expect(selected.map((sample) => sample.id)).toEqual(['own-1']);
  });

  it('always keeps pasted samples first and fills the cap in reply/original balance', () => {
    const replies = Array.from({ length: 10 }, (_, index) =>
      candidate(`reply-${index}`, `reply number ${index}`, {
        daysAgo: index,
        kind: 'reply',
      }),
    );
    const originals = Array.from({ length: 10 }, (_, index) =>
      candidate(`original-${index}`, `original number ${index}`, {
        daysAgo: index,
      }),
    );
    const pasted = toPastedCandidates(['my pasted post', '   ']);

    const selected = selectVoiceCorpus(
      [...originals, ...replies, ...pasted],
      7,
    );

    expect(selected).toHaveLength(7);
    expect(selected[0]).toMatchObject({ id: 'pasted-1', origin: 'pasted' });
    expect(selected.filter((sample) => sample.kind === 'reply')).toHaveLength(
      3,
    );
    expect(
      selected.filter(
        (sample) => sample.kind === 'original' && sample.origin !== 'pasted',
      ),
    ).toHaveLength(3);
    // Recent posts win when engagement is unknown.
    expect(selected.map((sample) => sample.id)).toContain('reply-0');
    expect(selected.map((sample) => sample.id)).not.toContain('reply-9');
  });

  it('fills leftover slots from the larger kind when one runs out', () => {
    const selected = selectVoiceCorpus(
      [
        candidate('reply-a', 'only reply', { kind: 'reply' }),
        ...Array.from({ length: 6 }, (_, index) =>
          candidate(`original-${index}`, `original ${index}`, {
            daysAgo: index,
          }),
        ),
      ],
      5,
    );

    expect(selected).toHaveLength(5);
    expect(selected.map((sample) => sample.id)).toContain('reply-a');
  });

  it('prefers better-performing posts at equal recency and demotes published posts', () => {
    const selected = selectVoiceCorpus(
      [
        candidate('low', 'low engagement post', { engagement: 1 }),
        candidate('high', 'high engagement post', { engagement: 500 }),
        candidate('published', 'published by genfeed', {
          origin: 'published-post',
        }),
      ],
      1,
    );

    expect(selected.map((sample) => sample.id)).toEqual(['high']);
  });

  it('is deterministic regardless of input order', () => {
    const inputs = Array.from({ length: 12 }, (_, index) =>
      candidate(`c-${index}`, `text ${index}`, {
        daysAgo: index % 4,
        engagement: index % 3,
        kind: index % 2 === 0 ? 'reply' : 'original',
      }),
    );

    expect(selectVoiceCorpus([...inputs].reverse(), 6)).toEqual(
      selectVoiceCorpus(inputs, 6),
    );
  });
});

describe('brand voice corpus summary', () => {
  it('explains an empty corpus and how to fix it', () => {
    const summary = summarizeVoiceCorpus([]);

    expect(summary).toMatchObject({
      dateRange: null,
      guidance: EMPTY_CORPUS_GUIDANCE,
      isSufficient: false,
      label: 'no own posts found',
      sampleCount: 0,
    });
    expect(summary.guidance).toContain('Settings → Integrations');
    expect(summary.guidance).toContain('paste 10-20 of your own posts');
  });

  it('flags a thin corpus with the sample count', () => {
    const summary = summarizeVoiceCorpus(
      selectVoiceCorpus([
        candidate('a', 'one', { kind: 'reply' }),
        candidate('b', 'two'),
      ]),
    );

    expect(summary.isSufficient).toBe(false);
    expect(summary.guidance).toMatch(/^Only 2 posts written by this brand were found/);
  });

  it('labels a sufficient corpus with counts, platforms, and date range', () => {
    const samples = selectVoiceCorpus(
      Array.from({ length: VOICE_CORPUS_MINIMUM_SAMPLES }, (_, index) =>
        candidate(`c-${index}`, `post ${index}`, {
          daysAgo: index,
          kind: index < 4 ? 'reply' : 'original',
          platform: index === 0 ? 'LinkedIn' : 'twitter',
        }),
      ),
    );

    const summary = summarizeVoiceCorpus(samples);

    expect(summary).toMatchObject({
      dateRange: { from: '2026-09-11', to: '2026-09-20' },
      isSufficient: true,
      platforms: ['linkedin', 'twitter'],
      replyCount: 4,
      sampleCount: 10,
    });
    expect(summary.guidance).toBeUndefined();
    expect(summary.label).toBe(
      'own posts: 10 samples (4 replies, 6 original) from linkedin, twitter, 2026-09-11 to 2026-09-20',
    );
  });
});

describe('brand voice prompt evidence', () => {
  const corpus = buildVoiceCorpus([
    candidate('r1', '@bob nah, ship the boring version first', {
      kind: 'reply',
    }),
    candidate('o1', 'we deleted 4k lines today and nothing broke', {
      daysAgo: 2,
    }),
    ...toPastedCandidates(['honestly the docs are the product']),
  ]);
  const promptSamples = pickPromptSamples(corpus.samples);

  it('quotes the real posts verbatim with their stats', () => {
    const prompt = buildVoiceEvidencePrompt(corpus, promptSamples);

    expect(prompt).toContain('[1] (original, pasted by user)');
    expect(prompt).toContain('honestly the docs are the product');
    expect(prompt).toContain('@bob nah, ship the boring version first');
    expect(prompt).toContain('we deleted 4k lines today and nothing broke');
    expect(prompt).toContain('Samples measured: 3');
    expect(prompt).toContain('Only 3 real posts are available');
    expect(prompt).toContain('Never rewrite, merge, or invent a post.');
  });

  it('returns no evidence block for an empty corpus', () => {
    expect(buildVoiceEvidencePrompt(buildVoiceCorpus([]), [])).toBeNull();
  });

  it('resolves exemplar picks to stored text and drops invented lines', () => {
    const exemplars = resolveVerbatimExemplars(
      {
        ids: [2, 99, 2],
        texts: [
          'Honestly the docs are the product',
          'a line the model made up',
        ],
      },
      promptSamples,
      8,
    );

    expect(exemplars).toEqual([
      promptSamples[1]?.text,
      'honestly the docs are the product',
    ]);
  });

  it('picks representative exemplars deterministically as a fallback', () => {
    expect(pickRepresentativeExemplars(corpus.samples, 2)).toEqual(
      pickRepresentativeExemplars([...corpus.samples].reverse(), 2),
    );
    expect(pickRepresentativeExemplars(corpus.samples, 2)).toHaveLength(2);
  });
});

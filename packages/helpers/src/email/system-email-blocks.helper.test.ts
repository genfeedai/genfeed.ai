import { describe, expect, it } from 'vitest';

import {
  buildEmailBigNumber,
  buildEmailHero,
  buildEmailStatRow,
  buildEmailSteps,
  buildEmailThumbnailGrid,
} from './system-email-blocks.helper';

describe('system email blocks', () => {
  it('renders each stat as a value over its label', () => {
    const html = buildEmailStatRow([
      { label: 'Created', value: '12' },
      { label: 'Published', value: '5' },
      { label: 'Credits used', value: '1,840' },
      { label: 'Ready', value: '7' },
    ]);

    expect(html).toContain('>12<');
    expect(html).toContain('>1,840<');
    expect(html).toContain('Credits used');
  });

  it.each([
    [1, 494],
    [2, 247],
    [4, 123],
    [5, 123],
    [6, 164],
  ])(
    'caps each of %i stats at its share of the card (%ipx), so phones wrap them',
    (count, cellWidth) => {
      const html = buildEmailStatRow(
        Array.from({ length: count }, (_, index) => ({
          label: `Stat ${index}`,
          value: '1',
        })),
      );

      expect(html.split(`max-width:${cellWidth}px`)).toHaveLength(count + 1);
    },
  );

  it('rebuilds fixed rows of four for Outlook desktop', () => {
    const html = buildEmailStatRow(
      ['a', 'b', 'c', 'd', 'e'].map((label) => ({ label, value: '1' })),
    );

    expect(html.split('</td></tr><tr><td width="123"')).toHaveLength(2);
  });

  it('escapes stat text', () => {
    expect(buildEmailStatRow([{ label: '<b>x</b>', value: '1' }])).toContain(
      '&lt;b&gt;x&lt;/b&gt;',
    );
  });

  it('draws a waveform for audio and text lines for an article, never a word', () => {
    const audio = buildEmailThumbnailGrid([{ kind: 'audio' }]);
    const article = buildEmailThumbnailGrid([{ kind: 'article' }]);
    const image = buildEmailThumbnailGrid([{ kind: 'image' }]);

    for (const html of [audio, article, image]) {
      expect(html).not.toContain('<img');
      expect(html).not.toMatch(/>(Audio|Article|Image|Video)</i);
    }
    // 18 waveform bars, each a 3px-wide cell.
    expect(audio.match(/width:3px/g)).toHaveLength(18);
    expect(article.match(/height:5px/g)).toHaveLength(5);
  });

  it('keeps a stat label on one line so Ready to publish never wraps', () => {
    const html = buildEmailStatRow([
      { label: 'Ready to publish', value: '7' },
      { label: 'Created', value: '7' },
    ]);

    expect(html.match(/white-space:nowrap/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    '/relative.png',
  ])('drops an image that is not hosted http(s): %s', (imageUrl) => {
    const html = buildEmailThumbnailGrid([{ imageUrl, kind: 'image' }]);

    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
  });

  it('renders a hosted image linked to its destination', () => {
    const html = buildEmailThumbnailGrid([
      {
        href: 'https://app.genfeed.ai/library',
        imageUrl: 'https://cdn.genfeed.ai/ingredients/images/abc',
        kind: 'image',
      },
    ]);

    expect(html).toContain(
      'src="https://cdn.genfeed.ai/ingredients/images/abc"',
    );
    expect(html).toContain('href="https://app.genfeed.ai/library"');
  });

  it.each([
    [
      'a grid tile',
      () =>
        buildEmailThumbnailGrid([
          {
            href: 'https://app.genfeed.ai/library',
            imageUrl: 'https://cdn.genfeed.ai/ingredients/thumbnails/abc',
            kind: 'video',
            label: 'Launch teaser',
          },
        ]),
    ],
    [
      'the hero',
      () =>
        buildEmailHero({
          imageUrl: 'https://cdn.genfeed.ai/ingredients/thumbnails/abc',
          kind: 'video',
          label: 'Launch teaser',
        }),
    ],
  ])(
    'shows a video as its first frame with a play button on %s',
    (_label, build) => {
      const html = build();

      expect(html).toContain(
        "url('https://cdn.genfeed.ai/ingredients/thumbnails/abc')",
      );
      expect(html).toContain('&#9654;');
      expect(html).toContain('aria-label="Launch teaser"');
    },
  );

  it('links a video tile to its destination', () => {
    const html = buildEmailThumbnailGrid([
      {
        href: 'https://app.genfeed.ai/library',
        imageUrl: 'https://cdn.genfeed.ai/ingredients/thumbnails/abc',
        kind: 'video',
      },
    ]);

    expect(html).toContain('href="https://app.genfeed.ai/library"');
  });

  it('puts the play button on a video frame only, never on a still image', () => {
    const html = buildEmailThumbnailGrid([
      {
        imageUrl: 'https://cdn.genfeed.ai/ingredients/images/abc',
        kind: 'image',
      },
    ]);

    expect(html).not.toContain('&#9654;');
  });

  it('cannot be broken out of the frame by a quote or bracket in the URL', () => {
    const html = buildEmailThumbnailGrid([
      {
        imageUrl:
          "https://cdn.genfeed.ai/a');background:url('https://evil.test",
        kind: 'video',
      },
    ]);

    expect(html).not.toContain("');background");
    expect(html).toContain('%27%29');
  });

  it('cannot be broken out of the frame by an HTML character reference in the URL', () => {
    const html = buildEmailThumbnailGrid([
      {
        imageUrl: 'https://cdn.genfeed.ai/frame#&#39;);display:none;/*',
        kind: 'video',
      },
    ]);

    // Escaped, so the browser decodes it back to the same text, not to a quote.
    expect(html).toContain('frame#&amp;#39;%29;display:none;/*');
    expect(html).not.toContain('#&#39;');
  });

  it.each([
    [
      'a grid tile',
      (href: string) =>
        buildEmailThumbnailGrid([
          {
            href,
            imageUrl: 'https://cdn.genfeed.ai/ingredients/images/abc',
            kind: 'image',
          },
        ]),
    ],
    [
      'the hero',
      (href: string) =>
        buildEmailHero({
          href,
          imageUrl: 'https://cdn.genfeed.ai/ingredients/images/abc',
          kind: 'image',
        }),
    ],
  ])(
    'renders the hosted image of %s without a link when its destination is unsafe',
    (_label, build) => {
      for (const href of ['javascript:alert(1)', '/library']) {
        const html = build(href);

        expect(html).toContain(
          'src="https://cdn.genfeed.ai/ingredients/images/abc"',
        );
        expect(html).not.toContain('<a ');
        expect(html).not.toContain(href);
      }
    },
  );

  it('reports how many pieces are not shown', () => {
    expect(
      buildEmailThumbnailGrid([{ kind: 'image' }], { moreCount: 6 }),
    ).toContain('+ 6 more in your library');
  });

  it('counts pieces past the six shown together with those the caller left out', () => {
    const items = Array.from({ length: 8 }, () => ({ kind: 'image' as const }));

    expect(buildEmailThumbnailGrid(items, { moreCount: 2 })).toContain(
      '+ 4 more in your library',
    );
  });

  it('lets image and text tiles shrink below 152px in narrow clients', () => {
    const html = buildEmailThumbnailGrid([
      {
        imageUrl: 'https://cdn.genfeed.ai/ingredients/images/abc',
        kind: 'image',
      },
      { kind: 'article' },
    ]);

    expect(html).toContain('table-layout:fixed');
    expect(html.match(/max-width:152px;[^"]*width:100%/g)).toHaveLength(2);
  });

  it('renders a hero image at full width', () => {
    const html = buildEmailHero({
      imageUrl: 'https://cdn.genfeed.ai/ingredients/images/abc',
      kind: 'image',
      meta: 'Trailhead Notebook',
    });

    expect(html).toContain('width:100%');
    expect(html).toContain('Trailhead Notebook');
  });

  it('renders one large figure', () => {
    expect(
      buildEmailBigNumber({ label: 'Credits left', value: '420' }),
    ).toContain('>420<');
  });

  it('numbers steps and ticks finished ones', () => {
    const html = buildEmailSteps([
      { isDone: true, title: 'Brand' },
      { title: 'Channel' },
    ]);

    expect(html).toContain('&#10003;');
    expect(html).toContain('>2<');
  });
});

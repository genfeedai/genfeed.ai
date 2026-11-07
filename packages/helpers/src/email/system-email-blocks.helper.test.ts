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
    expect(html.match(/<tr><td width/g)).toHaveLength(1);
  });

  it('wraps five or more stats onto a second row', () => {
    const html = buildEmailStatRow(
      ['a', 'b', 'c', 'd', 'e'].map((label) => ({ label, value: '1' })),
    );

    expect(html.match(/<tr><td width/g)).toHaveLength(2);
  });

  it('escapes stat text', () => {
    expect(buildEmailStatRow([{ label: '<b>x</b>', value: '1' }])).toContain(
      '&lt;b&gt;x&lt;/b&gt;',
    );
  });

  it('shows a text tile for content without a still', () => {
    const html = buildEmailThumbnailGrid([{ kind: 'audio' }]);

    expect(html).not.toContain('<img');
    expect(html).toContain('Audio');
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
        kind: 'video',
      },
    ]);

    expect(html).toContain(
      'src="https://cdn.genfeed.ai/ingredients/images/abc"',
    );
    expect(html).toContain('href="https://app.genfeed.ai/library"');
    expect(html).toContain('Video');
  });

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

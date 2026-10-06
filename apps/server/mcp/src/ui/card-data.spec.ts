import { getToolsForSurface, toMcpTools } from '@genfeedai/actions';
import { isPublicMcpRequest } from '@mcp/mcp/public-discovery';
import { cardResource } from '@mcp/ui/card-app';
import {
  buildCardView,
  MCP_APP_MIME_TYPE,
  MCP_CARD_RESOURCE_URI,
  safeCardUrl,
  withCardMetadata,
  withCardResult,
} from '@mcp/ui/card-data';

describe('MCP Apps card contract', () => {
  it('links content tools to a public HTML resource, preserving existing metadata', () => {
    const tools = toMcpTools(getToolsForSurface('mcp'));
    for (const name of [
      'get_posts',
      'list_assets',
      'generate',
      'transform_media',
      'get_articles',
      'get_account',
    ]) {
      const tool = tools.find((item) => item.name === name);
      expect(tool, name).toBeDefined();
      if (!tool) continue;
      expect(withCardMetadata(tool)).toMatchObject({
        ...tool,
        _meta: { ...tool._meta, ui: { resourceUri: MCP_CARD_RESOURCE_URI } },
      });
    }
    const unrelated = tools.find((item) => item.name === 'get_brands');
    if (!unrelated) throw new Error('Missing get_brands');
    expect(withCardMetadata(unrelated)).toBe(unrelated);
    const resource = cardResource();
    expect(resource.mimeType).toBe(MCP_APP_MIME_TYPE);
    expect(resource.text).toContain('<!doctype html>');
    expect(
      isPublicMcpRequest({
        jsonrpc: '2.0',
        method: 'resources/read',
        params: { uri: resource.uri },
      }),
    ).toBe(true);
    expect(
      isPublicMcpRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'get_posts' },
      }),
    ).toBe(false);
  });

  it('maps real post fields and preserves counts without inventing media URLs', () => {
    const view = buildCardView('get_posts', {
      posts: [
        {
          id: 'p1',
          label: 'Launch',
          description: 'Our new release',
          platform: 'linkedin',
          status: 'DRAFT',
          scheduledDate: '2026-09-23',
        },
      ],
      total: 30,
    });
    expect(view).toMatchObject({
      cards: [
        {
          id: 'p1',
          title: 'Launch',
          description: 'Our new release',
          kind: 'post',
          status: 'DRAFT',
          platform: 'linkedin',
          date: '2026-09-23',
        },
      ],
      total: 30,
    });
    expect(view?.cards[0].url).toBeUndefined();
    expect(
      buildCardView('get_posts', { post: { id: 'p2', label: 'Detail' } })
        ?.cards[0].id,
    ).toBe('p2');
  });

  it.each([
    ['image', 'image'],
    ['video', 'video'],
    ['music', 'audio'],
    ['voice', 'audio'],
  ])('preserves generate %s media and status', (assetKind, kind) => {
    expect(
      buildCardView('generate', {
        id: 'asset',
        assetKind,
        cdnUrl: 'https://cdn.genfeed.ai/file',
        status: 'PROCESSING',
      })?.cards[0],
    ).toMatchObject({
      id: 'asset',
      kind,
      status: 'PROCESSING',
      url: 'https://cdn.genfeed.ai/file',
    });
  });

  it('keeps a generic media card when a generate result names no asset kind', () => {
    expect(
      buildCardView('generate', { id: 'asset', status: 'PROCESSING' })?.cards[0]
        .kind,
    ).toBe('media');
  });

  it.each([
    ['edit', 'image'],
    ['reframe', 'image'],
    ['upscale', 'image'],
    ['merge', 'video'],
  ])('renders transform_media %s as a %s card', (_operation, kind) => {
    expect(
      buildCardView('transform_media', {
        id: 'asset',
        kind,
        status: 'processing',
      })?.cards[0],
    ).toMatchObject({ id: 'asset', kind, status: 'processing' });
  });

  it('keeps a generic media card when a transform_media result names no kind', () => {
    expect(
      buildCardView('transform_media', { id: 'asset' })?.cards[0].kind,
    ).toBe('media');
  });

  it.each([
    'generate_image',
    'generate_video',
    'generate_music',
    'generate_voice',
    'merge_videos',
    'create_article',
  ])('no longer builds cards for the removed %s tool', (name) => {
    expect(buildCardView(name, { id: 'asset' })).toBeUndefined();
  });

  it('renders generate_content articles as article cards and social copy as posts', () => {
    const article = buildCardView('generate_content', {
      articleId: 'art-1',
      content: 'Body',
      title: 'Guide',
      type: 'standard',
    });
    expect(article?.cards[0]).toMatchObject({
      id: 'art-1',
      kind: 'article',
      title: 'Guide',
    });

    const social = buildCardView('generate_content', {
      content: 'LinkedIn post',
      hashtags: [],
    });
    expect(social?.cards[0]).toMatchObject({ kind: 'post' });
  });

  it('builds article cards for both get_articles modes', () => {
    expect(
      buildCardView('get_articles', { id: 'a1', title: 'One' })?.cards[0].kind,
    ).toBe('article');
    expect(
      buildCardView('get_articles', [{ id: 'a1', title: 'One' }])?.cards[0]
        .kind,
    ).toBe('article');
  });

  it('renders every generated variation once in the responsive post layout', () => {
    const data = {
      content: 'First caption',
      variations: [
        { content: 'First caption', hashtags: [] },
        { content: 'Second caption', hashtags: [] },
      ],
    };
    const result = withCardResult('generate_content', {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: { data },
    });
    expect(result.structuredContent.data).toBe(data);
    expect(result).toMatchObject({
      structuredContent: {
        genfeedCards: {
          cards: [
            {
              description: 'First caption',
              kind: 'post',
              title: 'Variation 1',
            },
            {
              description: 'Second caption',
              kind: 'post',
              title: 'Variation 2',
            },
          ],
          layout: 'posts',
          total: 2,
        },
      },
    });
  });

  it.each([undefined, [], [{ content: 'Only caption' }]])(
    'keeps the single-result preview with variations %j',
    (variations) => {
      expect(
        buildCardView('generate_content', {
          content: 'Only caption',
          variations,
        }),
      ).toMatchObject({
        cards: [{ description: 'Only caption', kind: 'post', title: 'Post' }],
        total: 1,
      });
    },
  );

  it('ignores variation collections for generated articles and other tools', () => {
    const data = {
      articleId: 'article-1',
      content: 'Article body',
      title: 'Article title',
      variations: [{ content: 'Unrelated caption' }],
    };
    expect(buildCardView('generate_content', data)?.cards).toMatchObject([
      { description: 'Article body', kind: 'article', title: 'Article title' },
    ]);
    expect(buildCardView('create_post', data)?.cards).toMatchObject([
      { description: 'Article body', kind: 'post', title: 'Article title' },
    ]);
  });

  it.each(['get_article', 'search_articles', 'get_video_status'])(
    'no longer builds cards for the removed %s tool',
    (name) => {
      expect(buildCardView(name, { id: 'a1' })).toBeUndefined();
    },
  );

  it('maps job category and usage zeroes; bounds lists and user text', () => {
    expect(
      buildCardView('get_job_status', { id: 'job', category: 'VIDEO' })
        ?.cards[0].kind,
    ).toBe('video');
    expect(
      buildCardView('get_account', {
        usage: { currentBalance: 0, usage7Days: 0, breakdown: [] },
      })?.cards,
    ).toHaveLength(2);
    expect(buildCardView('get_account', { profile: { role: 'admin' } })).toBe(
      undefined,
    );
    expect(buildCardView('list_assets', [])?.cards).toEqual([]);
    const view = buildCardView(
      'list_assets',
      Array.from({ length: 30 }, () => ({ prompt: 'x'.repeat(5000) })),
    );
    expect(view?.cards).toHaveLength(24);
    expect(view?.total).toBe(30);
    expect(view?.cards[0].description).toHaveLength(4000);
  });

  it('retains text, resource links, and original structured data', () => {
    const result = {
      content: [
        { type: 'text', text: 'Image ready' },
        { type: 'resource_link', uri: 'https://cdn.genfeed.ai/image.png' },
      ],
      structuredContent: {
        data: { id: 'image', url: 'https://cdn.genfeed.ai/image.png' },
        artifact: { id: 'image' },
      },
    };
    const decorated = withCardResult('generate', result);
    expect(decorated).toMatchObject(result);
    expect(decorated).toHaveProperty(
      'structuredContent.genfeedCards.cards.0.id',
      'image',
    );
    expect(
      withCardResult('generate', { ...result, isError: true }),
    ).not.toHaveProperty('structuredContent.genfeedCards');
    expect(
      withCardResult('create_post', {
        content: [{ type: 'text', text: 'Approval required' }],
      }),
    ).not.toHaveProperty('structuredContent');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://user:password@example.com/file',
    '/relative',
    'bad url',
  ])('rejects unsafe URLs: %s', (value) => {
    expect(safeCardUrl(value)).toBeUndefined();
  });

  it('links tools under the MCP Apps key, the legacy flat key and the ChatGPT alias', () => {
    const tool = toMcpTools(getToolsForSurface('mcp')).find(
      (item) => item.name === 'generate',
    );
    if (!tool) throw new Error('Missing generate');

    expect(MCP_CARD_RESOURCE_URI).toMatch(
      /^ui:\/\/genfeed\/content-cards-v5-[a-f0-9]{12}\.html$/,
    );
    expect(withCardMetadata(tool)._meta).toMatchObject({
      'openai/outputTemplate': MCP_CARD_RESOURCE_URI,
      'openai/toolInvocation/invoked': 'Media ready',
      'openai/toolInvocation/invoking': 'Working on media…',
      ui: { resourceUri: MCP_CARD_RESOURCE_URI },
      'ui/resourceUri': MCP_CARD_RESOURCE_URI,
    });
  });

  it('lays out get_posts {days} as a content calendar with gap days', () => {
    const view = buildCardView('get_posts', {
      days: 3,
      draftsCount: 2,
      gapDays: ['2026-10-05'],
      gapsCount: 1,
      scheduled: [
        {
          description: 'Evening post',
          id: 'p2',
          platform: 'linkedin',
          scheduledDate: '2026-10-04T18:00:00.000Z',
        },
        {
          description: 'Morning post',
          id: 'p1',
          platform: 'instagram',
          scheduledDate: '2026-10-04T09:00:00.000Z',
        },
        {
          description: 'Launch',
          id: 'p3',
          platform: 'twitter',
          scheduledDate: '2026-10-06T12:00:00.000Z',
        },
        { description: 'No date', id: 'p4' },
      ],
      scheduledCount: 4,
    });

    expect(view).toMatchObject({
      calendar: { draftsCount: 2 },
      layout: 'calendar',
      title: 'Content calendar',
      total: 4,
    });
    expect(
      view?.calendar?.days.map((day) => [
        day.date,
        day.isGap,
        day.posts.map((post) => post.id),
      ]),
    ).toEqual([
      ['2026-10-04', false, ['p1', 'p2']],
      ['2026-10-05', true, []],
      ['2026-10-06', false, ['p3']],
    ]);
  });

  it('marks running media jobs pending with their progress, never posts or finished media', () => {
    expect(
      buildCardView('generate', {
        category: 'VIDEO',
        id: 'job',
        progress: 42.4,
        stage: 'Rendering',
        status: 'PROCESSING',
      })?.cards[0],
    ).toMatchObject({
      isPending: true,
      kind: 'video',
      progress: 42,
      stage: 'Rendering',
    });
    expect(
      buildCardView('get_job_status', {
        category: 'VIDEO',
        id: 'job',
        status: 'COMPLETED',
        url: 'https://cdn.genfeed.ai/video.mp4',
      })?.cards[0].isPending,
    ).toBeUndefined();
    expect(
      buildCardView('get_posts', { posts: [{ id: 'p', status: 'pending' }] })
        ?.cards[0].isPending,
    ).toBeUndefined();
  });

  it('maps post media kinds and the first playable attachment', () => {
    expect(
      buildCardView('get_posts', {
        posts: [
          {
            id: 'p1',
            media: [
              { assetId: 'a1', kind: 'image', order: 0 },
              {
                assetId: 'a2',
                kind: 'video',
                url: 'https://cdn.genfeed.ai/clip.mp4',
              },
              { assetId: 'a3', kind: 'unknown' },
            ],
          },
        ],
      })?.cards[0],
    ).toMatchObject({
      attachments: ['image', 'video'],
      mediaKind: 'video',
      mediaUrl: 'https://cdn.genfeed.ai/clip.mp4',
    });
  });

  it('chooses the post, media or card layout from the tool kind', () => {
    expect(buildCardView('get_posts', { posts: [] })?.layout).toBe('posts');
    expect(buildCardView('list_assets', [])?.layout).toBe('media');
    expect(buildCardView('get_articles', [])?.layout).toBe('cards');
  });

  it('restricts media CSP to configured origins with no API connectivity', () => {
    expect(
      cardResource([
        'https://media.example.com/path',
        'https://media.example.com/other',
        'javascript:bad',
      ])._meta.ui.csp,
    ).toEqual({
      connectDomains: [],
      resourceDomains: ['https://media.example.com', 'https://mcp.genfeed.ai'],
    });
  });
});

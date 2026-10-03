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
    'generate_image',
    'generate_video',
    'generate_music',
    'generate_voice',
  ])('no longer builds cards for the removed %s tool', (name) => {
    expect(buildCardView(name, { id: 'asset' })).toBeUndefined();
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

  it('restricts media CSP to configured origins with no API connectivity', () => {
    expect(
      cardResource([
        'https://media.example.com/path',
        'https://media.example.com/other',
        'javascript:bad',
      ])._meta.ui.csp,
    ).toEqual({
      connectDomains: [],
      resourceDomains: ['https://media.example.com'],
    });
  });
});

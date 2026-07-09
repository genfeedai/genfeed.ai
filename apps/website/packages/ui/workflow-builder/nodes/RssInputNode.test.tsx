import '@testing-library/jest-dom/vitest';
import { WorkflowNodeStatus } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RssInputNode, type RssInputNodeData } from './RssInputNode';

const defaultData: RssInputNodeData = {
  feedItems: null,
  feedTitle: null,
  feedUrl: 'https://example.com/feed.xml',
  inputMode: 'url',
  label: 'RSS input',
  rawXml: '',
  selectedItemIndex: 0,
  status: WorkflowNodeStatus.IDLE,
};

describe('Website RssInputNode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches RSS feed items from the core endpoint', async () => {
    const items = [
      {
        description: 'Post description',
        link: 'https://example.com/post',
        pubDate: '2026-07-09T00:00:00.000Z',
        title: 'Post title',
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ feedTitle: 'Example Feed', items }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onUpdate = vi.fn();

    render(<RssInputNode data={defaultData} id="rss-1" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Feed' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/v1/core/rss/fetch', {
        body: JSON.stringify({ url: defaultData.feedUrl, xml: null }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      expect(onUpdate).toHaveBeenCalledWith('rss-1', {
        feedItems: items,
        feedTitle: 'Example Feed',
        selectedItemIndex: 0,
        status: WorkflowNodeStatus.COMPLETE,
      });
    });
  });

  it('parses raw RSS XML through the core endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ feedTitle: 'XML Feed', items: [] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onUpdate = vi.fn();

    render(
      <RssInputNode
        data={{
          ...defaultData,
          feedUrl: '',
          inputMode: 'text',
          rawXml: '<rss><channel /></rss>',
        }}
        id="rss-1"
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Parse Feed' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/v1/core/rss/fetch', {
        body: JSON.stringify({
          url: null,
          xml: '<rss><channel /></rss>',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
  });

  it('surfaces RSS fetch failures through node error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Feed unavailable' }), {
          status: 502,
        }),
      ),
    );
    const onUpdate = vi.fn();

    render(<RssInputNode data={defaultData} id="rss-1" onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Feed' }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('rss-1', {
        error: 'Feed unavailable',
        status: WorkflowNodeStatus.ERROR,
      });
    });
  });
});

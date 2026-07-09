import '@testing-library/jest-dom/vitest';
import { WorkflowNodeStatus } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TweetInputNode, type TweetInputNodeData } from './TweetInputNode';

const defaultData: TweetInputNodeData = {
  authorHandle: null,
  extractedTweet: null,
  inputMode: 'url',
  label: 'Tweet input',
  rawText: '',
  status: WorkflowNodeStatus.IDLE,
  tweetUrl: 'https://twitter.com/user/status/123',
};

describe('Website TweetInputNode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches tweet text from the core endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ authorHandle: 'genfeedai', text: 'Launch note' }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const onUpdate = vi.fn();

    render(
      <TweetInputNode data={defaultData} id="tweet-1" onUpdate={onUpdate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Tweet' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/v1/core/tweet/fetch', {
        body: JSON.stringify({ url: defaultData.tweetUrl }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      expect(onUpdate).toHaveBeenCalledWith('tweet-1', {
        authorHandle: 'genfeedai',
        extractedTweet: 'Launch note',
        status: WorkflowNodeStatus.COMPLETE,
      });
    });
  });

  it('surfaces tweet fetch failures through node error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Tweet unavailable' }), {
          status: 502,
        }),
      ),
    );
    const onUpdate = vi.fn();

    render(
      <TweetInputNode data={defaultData} id="tweet-1" onUpdate={onUpdate} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Tweet' }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('tweet-1', {
        error: 'Tweet unavailable',
        status: WorkflowNodeStatus.ERROR,
      });
    });
  });
});

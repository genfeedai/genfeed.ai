import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createRssInputExecutor } from '@workflow-engine/executors/saas/rss-input-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'wf-1',
};
const feedResult = {
  items: [
    {
      description: 'Desc 1',
      link: 'http://1',
      pubDate: '2025-01-01',
      title: 'Item 1',
    },
    { description: 'Desc 2', link: 'http://2', pubDate: null, title: 'Item 2' },
  ],
  title: 'Test Feed',
};

function makeInput(config: Record<string, unknown>) {
  return {
    context: ctx,
    inputs: new Map<string, unknown>(),
    node: {
      config,
      id: 'rss-1',
      inputs: [],
      label: 'RSS',
      type: 'rssInput',
    } as ExecutableNode,
  };
}

describe('RssInputExecutor', () => {
  describe('validate', () => {
    it('valid url mode', () => {
      expect(
        createRssInputExecutor().validate({
          config: { feedUrl: 'http://f.xml', inputMode: 'url' },
          id: '1',
          inputs: [],
          label: 'R',
          type: 'rssInput',
        }).valid,
      ).toBe(true);
    });
    it('invalid url mode without url', () => {
      expect(
        createRssInputExecutor().validate({
          config: { inputMode: 'url' },
          id: '1',
          inputs: [],
          label: 'R',
          type: 'rssInput',
        }).valid,
      ).toBe(false);
    });
    it('valid text mode', () => {
      expect(
        createRssInputExecutor().validate({
          config: { inputMode: 'text', rawXml: '<rss/>' },
          id: '1',
          inputs: [],
          label: 'R',
          type: 'rssInput',
        }).valid,
      ).toBe(true);
    });
    it('invalid without mode', () => {
      expect(
        createRssInputExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'R',
          type: 'rssInput',
        }).valid,
      ).toBe(false);
    });
  });

  describe('execute', () => {
    it('fetches from URL', async () => {
      const fetcher = vi.fn().mockResolvedValue(feedResult);
      const exec = createRssInputExecutor(fetcher);
      const result = await exec.execute(
        makeInput({ feedUrl: 'http://f.xml', inputMode: 'url' }),
      );
      expect((result.data as any).title).toBe('Item 1');
      expect(result.metadata?.feedTitle).toBe('Test Feed');
    });

    it('parses raw XML', async () => {
      const parser = vi.fn().mockResolvedValue(feedResult);
      const exec = createRssInputExecutor(undefined, parser);
      const result = await exec.execute(
        makeInput({ inputMode: 'text', rawXml: '<rss/>' }),
      );
      expect((result.data as any).title).toBe('Item 1');
    });

    it('selects item by index', async () => {
      const fetcher = vi.fn().mockResolvedValue(feedResult);
      const exec = createRssInputExecutor(fetcher);
      const result = await exec.execute(
        makeInput({
          feedUrl: 'http://f.xml',
          inputMode: 'url',
          selectedItemIndex: 1,
        }),
      );
      expect((result.data as any).title).toBe('Item 2');
    });

    it('throws on out-of-range index', async () => {
      const fetcher = vi.fn().mockResolvedValue(feedResult);
      const exec = createRssInputExecutor(fetcher);
      await expect(
        exec.execute(
          makeInput({
            feedUrl: 'http://f.xml',
            inputMode: 'url',
            selectedItemIndex: 5,
          }),
        ),
      ).rejects.toThrow('No item at index 5');
    });

    it('throws without fetcher', async () => {
      await expect(
        createRssInputExecutor().execute(
          makeInput({ feedUrl: 'http://f', inputMode: 'url' }),
        ),
      ).rejects.toThrow('fetcher');
    });

    it('throws without parser', async () => {
      await expect(
        createRssInputExecutor().execute(
          makeInput({ inputMode: 'text', rawXml: '<rss/>' }),
        ),
      ).rejects.toThrow('parser');
    });
  });
});

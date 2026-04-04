import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type RssInputMode = 'url' | 'text';

export interface RssFeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string | null;
}

export interface RssFeedResult {
  title: string;
  items: RssFeedItem[];
}

export type RssFeedFetcher = (feedUrl: string) => Promise<RssFeedResult>;
export type RssFeedParser = (rawXml: string) => Promise<RssFeedResult>;

/**
 * RSS Input Executor
 *
 * Fetches and parses RSS feeds from URL or raw XML.
 * Used for content aggregation workflows.
 *
 * Node Type: rssInput
 * Definition: @cloud/workflow-saas/nodes/rss-input.ts
 */
export class RssInputExecutor extends BaseExecutor {
  readonly nodeType = 'rssInput';
  private fetcher: RssFeedFetcher | null = null;
  private parser: RssFeedParser | null = null;

  setFetcher(fetcher: RssFeedFetcher): void {
    this.fetcher = fetcher;
  }

  setParser(parser: RssFeedParser): void {
    this.parser = parser;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const inputMode = node.config.inputMode as RssInputMode | undefined;

    if (inputMode === 'url') {
      const feedUrl = node.config.feedUrl;
      if (!feedUrl || typeof feedUrl !== 'string') {
        errors.push('Feed URL is required when input mode is "url"');
      }
    } else if (inputMode === 'text') {
      const rawXml = node.config.rawXml;
      if (!rawXml || typeof rawXml !== 'string') {
        errors.push('Raw XML is required when input mode is "text"');
      }
    } else {
      errors.push('Input mode must be "url" or "text"');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node } = input;

    const inputMode = this.getRequiredConfig<RssInputMode>(
      node.config,
      'inputMode',
    );
    const selectedItemIndex = this.getOptionalConfig<number>(
      node.config,
      'selectedItemIndex',
      0,
    );

    let result: RssFeedResult;

    if (inputMode === 'url') {
      if (!this.fetcher) {
        throw new Error('RSS feed fetcher not configured');
      }
      const feedUrl = this.getRequiredConfig<string>(node.config, 'feedUrl');
      result = await this.fetcher(feedUrl);
    } else {
      if (!this.parser) {
        throw new Error('RSS feed parser not configured');
      }
      const rawXml = this.getRequiredConfig<string>(node.config, 'rawXml');
      result = await this.parser(rawXml);
    }

    const selectedItem = result.items[selectedItemIndex];

    if (!selectedItem) {
      throw new Error(
        `No item at index ${selectedItemIndex}. Feed has ${result.items.length} items.`,
      );
    }

    return {
      data: {
        description: selectedItem.description,
        link: selectedItem.link,
        title: selectedItem.title,
      },
      metadata: {
        feedTitle: result.title,
        inputMode,
        itemCount: result.items.length,
        selectedIndex: selectedItemIndex,
      },
    };
  }
}

export function createRssInputExecutor(
  fetcher?: RssFeedFetcher,
  parser?: RssFeedParser,
): RssInputExecutor {
  const executor = new RssInputExecutor();
  if (fetcher) {
    executor.setFetcher(fetcher);
  }
  if (parser) {
    executor.setParser(parser);
  }
  return executor;
}

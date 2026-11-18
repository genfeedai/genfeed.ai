import { ModelCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  extractFamilyUrls,
  extractWorkflowUrls,
  HIGGSFIELD_IMAGE_CATALOG_URL,
  HIGGSFIELD_VIDEO_CATALOG_URL,
  type HiggsfieldCatalogEntry,
  parseWorkflowPage,
} from '@workers/crons/higgsfield-model-watcher/higgsfield-docs-catalog.util';

const HIGGSFIELD_DOCS_CLIENT_OPTIONS = Symbol('HIGGSFIELD_DOCS_CLIENT_OPTIONS');

export interface HiggsfieldDocsCatalogClientOptions {
  fetcher?: typeof fetch;
}

/** What one read of the public docs catalog produced. */
export interface HiggsfieldCatalogSnapshot {
  entries: HiggsfieldCatalogEntry[];
  /** Pages that could not be read. A non-empty list means the snapshot may be partial. */
  failedUrls: string[];
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;
const CONCURRENCY = 6;

interface CatalogSource {
  category: ModelCategory.IMAGE | ModelCategory.VIDEO;
  indexUrl: string;
}

const CATALOG_SOURCES: readonly CatalogSource[] = [
  { category: ModelCategory.VIDEO, indexUrl: HIGGSFIELD_VIDEO_CATALOG_URL },
  { category: ModelCategory.IMAGE, indexUrl: HIGGSFIELD_IMAGE_CATALOG_URL },
];

/**
 * Reads the Higgsfield model catalog from its public docs. Higgsfield has no
 * model-listing endpoint (the docs point to the console), so the catalog index,
 * family and workflow pages are the only machine-readable source. No API key is
 * involved.
 */
@Injectable()
export class HiggsfieldDocsCatalogClient {
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly logger: LoggerService,
    @Optional()
    @Inject(HIGGSFIELD_DOCS_CLIENT_OPTIONS)
    options?: HiggsfieldDocsCatalogClientOptions,
  ) {
    this.fetcher = options?.fetcher ?? globalThis.fetch;
  }

  async fetchCatalog(): Promise<HiggsfieldCatalogSnapshot> {
    const failedUrls: string[] = [];
    const byEndpoint = new Map<string, HiggsfieldCatalogEntry>();

    for (const source of CATALOG_SOURCES) {
      const index = await this.fetchText(source.indexUrl);
      if (index === null) {
        failedUrls.push(source.indexUrl);
        continue;
      }

      const families = await this.mapWithLimit(
        extractFamilyUrls(index),
        async (url) => ({ markdown: await this.fetchText(url), url }),
      );
      const workflowUrls = new Set<string>();
      for (const family of families) {
        if (family.markdown === null) {
          failedUrls.push(family.url);
          continue;
        }
        for (const url of extractWorkflowUrls(family.markdown)) {
          workflowUrls.add(url);
        }
      }

      const workflows = await this.mapWithLimit(
        [...workflowUrls],
        async (url) => ({ markdown: await this.fetchText(url), url }),
      );
      for (const workflow of workflows) {
        if (workflow.markdown === null) {
          failedUrls.push(workflow.url);
          continue;
        }
        const entry = parseWorkflowPage(
          workflow.markdown,
          workflow.url,
          source.category,
        );
        if (entry && !byEndpoint.has(entry.endpoint)) {
          byEndpoint.set(entry.endpoint, entry);
        }
      }
    }

    return { entries: [...byEndpoint.values()], failedUrls };
  }

  /** Page text, or null when the page could not be read after the retries. */
  private async fetchText(url: string): Promise<string | null> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.fetcher(url, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) return await response.text();
        // A 4xx will not change on a retry.
        if (response.status >= 400 && response.status < 500) return null;
      } catch (error: unknown) {
        this.logger.warn(
          `HiggsfieldDocsCatalogClient fetch failed (${error instanceof Error ? error.name : 'unknown'})`,
        );
      }
    }
    return null;
  }

  private async mapWithLimit<TInput, TOutput>(
    items: readonly TInput[],
    task: (item: TInput) => Promise<TOutput>,
  ): Promise<TOutput[]> {
    const results: TOutput[] = new Array(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index] as TInput);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
    );
    return results;
  }
}

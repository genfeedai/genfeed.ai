/**
 * `--suite=product-ab` (#7333): the smoke's text cell in `product` mode.
 *
 * The baseline is the harness's own raw call (one cheap model, the prompt
 * alone). The challenger is the product's text pipeline: the same prompt goes
 * to `POST /posts/draft-generations` with the eval organization's API key and
 * the synthetic Kelder brand, so the brand kit, harness brief, branded-text
 * receipt and credit ledger run as they do for a customer. Both arms face the
 * same deterministic checks and cross-family judge, pairwise and pointwise.
 *
 * Flags, read from argv (the common ones are `bun run eval:content`'s):
 *   --genfeed-api-url=<url>   live: product API base
 *   --brands=kelder:<id>      live: eval-org brand the product writes as
 *   --product-model=<key>     model the cross-family rule assumes the product
 *                             uses; defaults to the seed fallback. The model
 *                             the product actually reports is recorded per
 *                             call, and a row is voided if it shares a family
 *                             with a judge.
 * Environment (live): CONTENT_EVAL_GENFEED_API_KEY.
 *
 * Only kinds with a product text route run (`PRODUCT_TEXT_ROUTES`: X and
 * LinkedIn posts, X threads, X author replies); the rest of the fixture is left
 * out and shown as "no product route" in the summary.
 */

import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { readFlag, UsageError } from '../cli';
import type { SuitePreparation, SuiteRunner } from '../contracts';
import { readLiveApiKey, readPairs } from '../media/suite';
import {
  createStubTextGeneration,
  PRODUCT_TEXT_ROUTES,
  ProductApiTextGeneration,
  type ProductTextBinding,
  routeRowProblem,
} from '../text/product-generation';
import { createComparisonSuite } from './compare';
import { loadTextFixture } from './text-fixture';

async function buildLiveBinding(argv: string[]): Promise<ProductTextBinding> {
  const apiUrl = readFlag(argv, 'genfeed-api-url');
  if (!apiUrl) {
    throw new UsageError(
      '--genfeed-api-url is required for a live product-ab run (the product API the eval organization generates through)',
    );
  }
  const brands = readPairs(readFlag(argv, 'brands'), 'brands');
  const brandId = brands.find(([name]) => name === 'kelder')?.[1];
  if (!brandId) {
    throw new UsageError(
      '--brands=kelder:<id> is required for a live product-ab run (the eval-org brand the product writes as)',
    );
  }

  return {
    brandId,
    port: new ProductApiTextGeneration({
      apiKey: await readLiveApiKey(),
      apiUrl,
    }),
  };
}

export function createProductAbSuite(): SuiteRunner {
  let binding: ProductTextBinding | null = null;
  const comparison = createComparisonSuite('product-ab', () => binding);

  return {
    async prepare(options): Promise<SuitePreparation> {
      const argv = options.argv ?? [];
      const [model, ...extra] = options.models;
      if (!model || extra.length > 0) {
        throw new UsageError(
          'product-ab holds the raw arm fixed: pass exactly one --models key',
        );
      }
      const productModel =
        readFlag(argv, 'product-model') ?? LLM_DEFAULTS.productTextFallback;

      const loaded = loadTextFixture(options.fixturePath, 'product-ab');
      const rows = loaded.rows.filter(
        (row) => PRODUCT_TEXT_ROUTES[row.contentKind] !== undefined,
      );
      if (rows.length === 0) {
        throw new UsageError(
          `${loaded.path} has no row of a kind with a product text route (${Object.keys(PRODUCT_TEXT_ROUTES).join(', ')})`,
        );
      }
      for (const row of rows) {
        const problem = routeRowProblem(row);
        if (problem) throw new UsageError(`${loaded.path}: ${problem}`);
      }

      binding =
        options.dispatcherKind === 'live'
          ? await buildLiveBinding(argv)
          : {
              brandId: 'stub-brand',
              port: createStubTextGeneration(productModel),
            };

      return {
        contestants: [
          {
            guidanceArm: 'raw',
            id: `${model}#raw`,
            isCompiled: false,
            registryKey: model,
          },
          {
            guidanceArm: 'product',
            id: `${productModel}#product`,
            isCompiled: true,
            registryKey: productModel,
          },
        ],
        crossFamily: 'run',
        fixture: { ...loaded, rows },
      };
    },
    run: comparison.run,
    suite: 'product-ab',
  };
}

export const productAbSuite = createProductAbSuite();

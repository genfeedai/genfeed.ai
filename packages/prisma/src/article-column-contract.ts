/**
 * Public-article persistence contract for Sentry API-GENFEED-AI-71 / 72.
 *
 * Production listed and fetched public articles with a Prisma client that still
 * selected `articles.title` after 20260811160000 renamed the column to
 * `label`. The query is generated from the client, so source-level search
 * filters on `label` are not enough — the running client and the live table
 * must agree before the API listener binds.
 */

import { getModelMeta } from './enum-field-map';

/** Physical columns the public article list/slug paths persist and project. */
export const REQUIRED_ARTICLE_COLUMNS = [
  'coverImageUrl',
  'label',
  'summary',
] as const;

/** Column names retired by the #2767 rename. The Prisma client must not select them. */
export const RETIRED_ARTICLE_COLUMNS = ['excerpt', 'title'] as const;

export const ARTICLE_COLUMN_CONTRACT_MIGRATION =
  '20260811160000_rename_article_title_excerpt_to_label_summary';

export type ArticleColumnContractInput = {
  clientFields: readonly string[];
  presentColumns: readonly string[];
};

export function getMissingArticleColumns(
  presentColumns: readonly string[],
): string[] {
  const present = new Set(presentColumns);
  return REQUIRED_ARTICLE_COLUMNS.filter((column) => !present.has(column));
}

export function getRetiredArticleClientFields(
  clientFields: readonly string[],
): string[] {
  const fields = new Set(clientFields);
  return RETIRED_ARTICLE_COLUMNS.filter((column) => fields.has(column));
}

export function resolveArticleClientFields(
  clientFields?: readonly string[],
): readonly string[] {
  if (clientFields !== undefined) {
    return clientFields;
  }

  return getModelMeta('Article')?.allFields ?? [];
}

/**
 * Fail closed when the running Prisma Article client and the live `articles`
 * table disagree on `label`/`summary` vs the retired `title`/`excerpt`.
 */
export function assertArticleColumnContract(
  input: ArticleColumnContractInput,
): void {
  const clientFields = resolveArticleClientFields(input.clientFields);
  if (clientFields.length === 0) {
    throw new Error(
      'Prisma Article model metadata is missing; cannot verify the public article schema before serving traffic.',
    );
  }

  const retiredInClient = getRetiredArticleClientFields(clientFields);
  if (retiredInClient.length > 0) {
    throw new Error(
      `Prisma Article client still selects retired column(s): ${retiredInClient.join(', ')}. ` +
        'Public GET /v1/public/articles would throw ' +
        '`column articles.title does not exist` (Sentry API-GENFEED-AI-71 / 72).',
    );
  }

  const missingInClient = REQUIRED_ARTICLE_COLUMNS.filter(
    (column) => !new Set(clientFields).has(column),
  );
  if (missingInClient.length > 0) {
    throw new Error(
      `Prisma Article client is missing required column(s): ${missingInClient.join(', ')}.`,
    );
  }

  const missingInDb = getMissingArticleColumns(input.presentColumns);
  if (missingInDb.length > 0) {
    throw new Error(
      `Live articles table is missing required column(s): ${missingInDb.join(', ')}. ` +
        `Apply ${ARTICLE_COLUMN_CONTRACT_MIGRATION} before serving traffic.`,
    );
  }
}

export async function assertLiveArticleColumnContract(params: {
  clientFields?: readonly string[];
  findPresentColumns: () => Promise<readonly string[]>;
}): Promise<void> {
  assertArticleColumnContract({
    clientFields: resolveArticleClientFields(params.clientFields),
    presentColumns: await params.findPresentColumns(),
  });
}

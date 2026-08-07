import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { Article } from '@/api/articles';
import { getActiveBrand } from '@/config/store';
import { formatLabel, print, printJson } from '@/ui/theme';
import { NoBrandError } from '@/utils/errors';
import { waitForCompletion } from '@/utils/websocket';

type OutputLabel = readonly [string, string] | false | undefined;

export async function requireGenerationBrand(brand?: string): Promise<string> {
  const brandId = brand ?? (await getActiveBrand());
  if (brandId) return brandId;
  throw new NoBrandError();
}

/**
 * Split a `--keywords a,b,c` value into the string array the API expects.
 * Returns undefined when the flag is absent so the key is omitted from the
 * request body rather than sent as an empty array.
 */
export function parseKeywords(keywords?: string): string[] | undefined {
  if (!keywords) return undefined;
  const parsed = keywords
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Print one finished article. The headline lives on `label` — the serializer
 * has no `title` attribute — and word counts only exist on X articles.
 */
export function printArticle(article: Article): void {
  printGeneratedResult(false, {}, [
    ['ID', article.id],
    article.label ? ['Title', article.label] : false,
    article.summary ? ['Summary', article.summary] : false,
    article.category ? ['Category', article.category] : false,
    article.xArticleMetadata?.wordCount
      ? ['Words', String(article.xArticleMetadata.wordCount)]
      : false,
    ['Status', article.status],
  ]);
  print();
}

export async function waitForGenerated<T>(
  spinner: Ora,
  generatingType: string,
  generatedType: string,
  getResult: () => Promise<T>,
  taskId: string,
  taskType: 'IMAGE' | 'VIDEO',
  timeout: number
): Promise<{ elapsed: number; result: T }> {
  spinner.text = `Generating ${generatingType}...`;
  const completed = await waitForCompletion<T>({ getResult, spinner, taskId, taskType, timeout });
  spinner.succeed(`${generatedType} generated (${(completed.elapsed / 1000).toFixed(1)}s)`);
  return completed;
}

export function printGenerationStarted(id: string, status: string, json?: boolean): void {
  const statusCommand = `gf status ${id}`;
  if (json) {
    printJson({ id, status });
    return;
  }

  print(formatLabel('ID', id));
  print(formatLabel('Status', status));
  print();
  print(chalk.dim(`Check status with: ${statusCommand}`));
}

export function printGeneratedResult(
  json: boolean | undefined,
  jsonData: Record<string, unknown>,
  labels: OutputLabel[]
): void {
  if (json) {
    printJson(jsonData);
    return;
  }

  for (const label of labels) {
    if (label) {
      print(formatLabel(label[0], label[1]));
    }
  }
}

export async function downloadGeneratedFile(
  contentType: string,
  output: string,
  url: string
): Promise<void> {
  const downloadSpinner = ora(`Downloading ${contentType}...`).start();
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    await writeFile(output, Buffer.from(buffer));
    downloadSpinner.succeed(`Saved to ${output}`);
  } catch (err) {
    downloadSpinner.fail(`Failed to download ${contentType}`);
    throw err;
  }
}

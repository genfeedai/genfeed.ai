import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { getActiveBrand } from '@/config/store.js';
import { formatLabel, print, printJson } from '@/ui/theme.js';
import { NoBrandError } from '@/utils/errors.js';
import { waitForCompletion } from '@/utils/websocket.js';

type OutputLabel = readonly [string, string] | false | undefined;

export async function requireGenerationBrand(brand?: string): Promise<string> {
  const brandId = brand ?? (await getActiveBrand());
  if (brandId) return brandId;
  throw new NoBrandError();
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

export function printGenerationStarted(
  id: string,
  status: string,
  json?: boolean,
  statusType?: string,
  articleId?: string
): void {
  const statusId = articleId ?? id;
  const statusCommand = `gf status ${statusId}${statusType ? ` --type ${statusType}` : ''}`;
  if (json) {
    printJson(statusType ? { articleId, id, status, statusCommand } : { id, status });
    return;
  }

  print(formatLabel('ID', id));
  print(formatLabel('Status', status));
  if (articleId) {
    print(formatLabel('Article ID', articleId));
  }
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

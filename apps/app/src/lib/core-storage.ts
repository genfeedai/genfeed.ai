import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MIME_TYPES } from '@/lib/gallery/types';

export const CORE_DATA_DIR = path.resolve(
  process.cwd(),
  '../../data/workflows',
);
export const STUDIO_WORKFLOW_ID = 'studio';
export const EDITOR_WORKFLOW_ID = 'editor';

export function getWorkflowOutputDir(workflowId: string): string {
  return path.join(CORE_DATA_DIR, workflowId, 'output');
}

export function resolveGalleryPath(relativePath: string): string {
  return path.resolve(CORE_DATA_DIR, relativePath);
}

export function ensurePathInsideDataDir(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(CORE_DATA_DIR)) {
    throw new Error('Path escapes core data directory');
  }

  return resolved;
}

export function inferExtensionFromContentType(
  contentType: string | null,
): string {
  if (!contentType) return '.bin';

  const normalized = contentType.split(';')[0]?.trim().toLowerCase();
  const match = Object.entries(MIME_TYPES).find(
    ([, mime]) => mime === normalized,
  );
  return match?.[0] ?? '.bin';
}

export function inferExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname);
    return extension || '.bin';
  } catch {
    return '.bin';
  }
}

export function sanitizeExtension(extension: string): string {
  if (!extension.startsWith('.')) {
    return `.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'}`;
  }

  return extension.replace(/[^.a-z0-9]/gi, '').toLowerCase() || '.bin';
}

export async function persistRemoteAsset(options: {
  prefix: string;
  remoteUrl: string;
  workflowId: string;
}): Promise<{ path: string; size: number }> {
  const { prefix, remoteUrl, workflowId } = options;
  const outputDir = getWorkflowOutputDir(workflowId);
  await mkdir(outputDir, { recursive: true });

  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset: ${response.status}`);
  }

  const contentType = response.headers.get('content-type');
  const extension = sanitizeExtension(
    inferExtensionFromContentType(contentType) ||
      inferExtensionFromUrl(remoteUrl),
  );
  const filename = `${prefix}-${randomUUID()}${extension}`;
  const outputPath = ensurePathInsideDataDir(path.join(outputDir, filename));
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);

  return {
    path: `${workflowId}/output/${filename}`,
    size: buffer.byteLength,
  };
}

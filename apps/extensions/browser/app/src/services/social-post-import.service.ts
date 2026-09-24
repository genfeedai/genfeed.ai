import { parseSocialPostUrl, SocialSourceType } from '@genfeedai/contracts';

import type {
  ImportedSourcePost,
  SocialPostImportOutcome,
} from '~models/imported-source-post.model';
import { authService } from '~services/auth.service';
import { apiEndpoint } from '~services/environment.service';

export const UNSUPPORTED_POST_URL_MESSAGE =
  'URL is not a recognizable X, Instagram, or TikTok post link';

export class SocialPostImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialPostImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readApiErrorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) {
    return fallback;
  }
  const message = body.message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  if (Array.isArray(message)) {
    const first = message.find(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
    if (first) {
      return first.trim();
    }
  }
  return fallback;
}

function readImportedPost(value: unknown): ImportedSourcePost | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) {
    return null;
  }
  return {
    authorDisplayName:
      typeof value.authorDisplayName === 'string'
        ? value.authorDisplayName
        : null,
    authorHandle:
      typeof value.authorHandle === 'string' ? value.authorHandle : null,
    collectedAt:
      typeof value.collectedAt === 'string' ? value.collectedAt : null,
    id: value.id,
    platform: typeof value.platform === 'string' ? value.platform : '',
    sourceUrl: typeof value.sourceUrl === 'string' ? value.sourceUrl : null,
    text: typeof value.text === 'string' ? value.text : null,
  };
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function requestImportApi(
  path: string,
  method: 'GET' | 'POST',
  fallback: string,
  body?: unknown,
): Promise<unknown> {
  const token = await authService.getToken();
  if (!token) {
    throw new SocialPostImportError('Not authenticated');
  }
  const response = await fetch(`${apiEndpoint}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method,
  });
  const payload = await readBody(response);
  if (response.status === 401) {
    throw new SocialPostImportError('Not authenticated');
  }
  if (!response.ok) {
    throw new SocialPostImportError(readApiErrorMessage(payload, fallback));
  }
  return payload;
}

/**
 * Existing `POST /social-sources/import-post` contract.
 * Saves one brand-scoped source post. Does not write Knowledge or generate.
 */
export async function importSocialPost(input: {
  brandId: string;
  url: string;
}): Promise<SocialPostImportOutcome> {
  const brandId = input.brandId.trim();
  const url = input.url.trim();
  if (!brandId) {
    throw new SocialPostImportError(
      'Select a brand before importing this post.',
    );
  }
  if (!parseSocialPostUrl(url)) {
    throw new SocialPostImportError(UNSUPPORTED_POST_URL_MESSAGE);
  }
  const payload = await requestImportApi(
    `/social-sources/import-post?brandId=${encodeURIComponent(brandId)}`,
    'POST',
    'Could not import this post.',
    { url },
  );
  if (!isRecord(payload) || typeof payload.deduplicated !== 'boolean') {
    throw new SocialPostImportError(
      'Genfeed did not return the imported source.',
    );
  }
  const post = readImportedPost(payload.post);
  if (!post) {
    throw new SocialPostImportError(
      'Genfeed did not return the imported source.',
    );
  }
  return { deduplicated: payload.deduplicated, post };
}

/** Posts on this brand's import containers (`sourceType: post`). */
export async function listImportedSourcePosts(
  brandId: string,
): Promise<ImportedSourcePost[]> {
  const scopedBrandId = brandId.trim();
  if (!scopedBrandId) {
    throw new SocialPostImportError(
      'Select a brand before importing this post.',
    );
  }
  const params = new URLSearchParams({
    brandId: scopedBrandId,
    postsLimit: '100',
  });
  const payload = await requestImportApi(
    `/social-sources/feed?${params.toString()}`,
    'GET',
    'Could not load Imported sources.',
  );
  if (!isRecord(payload) || !Array.isArray(payload.posts)) {
    throw new SocialPostImportError('Could not load Imported sources.');
  }
  const importedSourceIds = new Set<string>();
  if (Array.isArray(payload.sources)) {
    for (const source of payload.sources) {
      if (
        isRecord(source) &&
        source.sourceType === SocialSourceType.POST &&
        typeof source.id === 'string' &&
        source.id
      ) {
        importedSourceIds.add(source.id);
      }
    }
  }
  const posts: ImportedSourcePost[] = [];
  for (const item of payload.posts) {
    if (
      !isRecord(item) ||
      !importedSourceIds.has(String(item.sourceId ?? ''))
    ) {
      continue;
    }
    const post = readImportedPost(item);
    if (post) {
      posts.push(post);
    }
  }
  return posts;
}

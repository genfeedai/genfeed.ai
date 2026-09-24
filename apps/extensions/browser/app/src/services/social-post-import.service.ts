import { parseSocialPostUrl, SocialSourceType } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';

import type {
  ImportedSourcePost,
  SocialPostImportOutcome,
} from '~models/imported-source-post.model';
import { authService } from '~services/auth.service';
import { apiEndpoint, appDomain } from '~services/environment.service';

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

const WORKSPACE_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
const IMPORTED_PAGE_LIMIT = 100;
const MAX_IMPORTED_PAGES = 20;

function readCollectionPost(item: unknown): ImportedSourcePost | null {
  if (!isRecord(item)) {
    return null;
  }
  const attributes = isRecord(item.attributes) ? item.attributes : {};
  return readImportedPost({
    ...attributes,
    id: typeof item.id === 'string' ? item.id : attributes.id,
  });
}

function readPageCount(payload: unknown): number {
  if (!isRecord(payload) || !isRecord(payload.links)) {
    return 1;
  }
  const pagination = payload.links.pagination;
  if (!isRecord(pagination) || typeof pagination.pages !== 'number') {
    return 1;
  }
  if (!Number.isFinite(pagination.pages) || pagination.pages < 1) {
    return 1;
  }
  return Math.min(MAX_IMPORTED_PAGES, Math.floor(pagination.pages));
}

/**
 * Posts whose container is `sourceType: post`, filtered before the page limit.
 * The brand feed's first 100 rows are not used: newer followed posts would
 * hide an older import.
 */
export async function listImportedSourcePosts(
  brandId: string,
): Promise<ImportedSourcePost[]> {
  const scopedBrandId = brandId.trim();
  if (!scopedBrandId) {
    throw new SocialPostImportError(
      'Select a brand before importing this post.',
    );
  }
  const posts: ImportedSourcePost[] = [];
  let pages = 1;
  for (let page = 1; page <= pages; page += 1) {
    const params = new URLSearchParams({
      brandId: scopedBrandId,
      limit: String(IMPORTED_PAGE_LIMIT),
      page: String(page),
      sourceType: SocialSourceType.POST,
    });
    const payload = await requestImportApi(
      `/source-posts?${params.toString()}`,
      'GET',
      'Could not load Imported sources.',
    );
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new SocialPostImportError('Could not load Imported sources.');
    }
    pages = Math.max(pages, readPageCount(payload));
    for (const item of payload.data) {
      const post = readCollectionPost(item);
      if (post) {
        posts.push(post);
      }
    }
  }
  return posts;
}

function readBrandSlug(payload: unknown, brandId: string): string | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }
  if (payload.data.id !== brandId || !isRecord(payload.data.attributes)) {
    return null;
  }
  const slug = payload.data.attributes.slug;
  return typeof slug === 'string' ? slug.trim() : null;
}

function readOrgSlug(payload: unknown): string | null {
  const rows = Array.isArray(payload) ? payload : [];
  const active = rows.find(
    (row) =>
      isRecord(row) && row.isActive === true && typeof row.slug === 'string',
  );
  const chosen =
    active ?? rows.find((row) => isRecord(row) && typeof row.slug === 'string');
  if (!isRecord(chosen) || typeof chosen.slug !== 'string') {
    return null;
  }
  return chosen.slug.trim();
}

/**
 * Existing publishing remix deep link. Selecting a source does not collect
 * or generate; the remix page waits for an explicit action.
 */
export async function resolveImportedRemixUrl(input: {
  brandId: string;
  platform: string;
  sourcePostId: string;
}): Promise<string> {
  const brandId = input.brandId.trim();
  const sourcePostId = input.sourcePostId.trim();
  const platform = input.platform.trim();
  if (!brandId || !sourcePostId || !platform) {
    throw new SocialPostImportError(
      'Select a brand and imported post before remixing.',
    );
  }
  const [brandPayload, organizations] = await Promise.all([
    requestImportApi(
      `/brands/${encodeURIComponent(brandId)}`,
      'GET',
      'Could not open remix.',
    ),
    requestImportApi(
      '/organizations?mine=true',
      'GET',
      'Could not open remix.',
    ),
  ]);
  const brandSlug = readBrandSlug(brandPayload, brandId);
  const orgSlug = readOrgSlug(organizations);
  if (
    !brandSlug ||
    !orgSlug ||
    !WORKSPACE_SLUG_PATTERN.test(brandSlug) ||
    !WORKSPACE_SLUG_PATTERN.test(orgSlug)
  ) {
    throw new SocialPostImportError(
      'This brand has no workspace link for remix.',
    );
  }
  const params = new URLSearchParams({
    platform,
    sourcePostId,
  });
  return `${appDomain}${createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.PUBLISHING.REMIX)}?${params.toString()}`;
}

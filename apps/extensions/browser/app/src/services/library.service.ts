import type {
  AgentArtifactReference,
  AgentContentMentionItem,
  IIngredient,
} from '@genfeedai/contracts/interfaces';
import {
  deserializeCollection,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { authService } from '~services/auth.service';
import { apiEndpoint } from '~services/environment.service';

export interface LibraryAsset extends AgentContentMentionItem {
  reference: AgentArtifactReference;
  kind: 'image' | 'video' | 'audio';
}

export async function loadLibraryAssets(
  brandId: string,
  options: { page?: number; search?: string; signal?: AbortSignal } = {},
): Promise<{ items: LibraryAsset[]; hasMore: boolean }> {
  if (!brandId.trim())
    throw new Error('Select a brand to browse your Library.');
  const token = await authService.getToken();
  const context = await authService.getAuthContext();
  if (!token || !context?.organization.id)
    throw new Error('Sign in to load your Library.');
  const page = options.page ?? 1;
  const query = new URLSearchParams({
    brandId,
    page: String(page),
    limit: '24',
    sort: 'createdAt: -1',
    isDeleted: 'false',
  });
  for (const status of ['GENERATED', 'VALIDATED', 'UPLOADED'])
    query.append('status', status);
  if (options.search) query.set('search', options.search);
  const response = await fetch(`${apiEndpoint}/ingredients?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: options.signal,
  });
  const document = (await response.json()) as JsonApiResponseDocument & {
    message?: string;
  };
  if (!response.ok)
    throw new Error(document.message || 'Could not load your Library.');
  const records = deserializeCollection<IIngredient>(document);
  const items: LibraryAsset[] = [];
  for (const record of records) {
    const recordBrand =
      record.brandId ??
      (typeof record.brand === 'string' ? record.brand : record.brand?.id);
    const organization =
      record.organizationId ??
      (typeof record.organization === 'string'
        ? record.organization
        : record.organization?.id);
    const category = record.category?.toUpperCase();
    if (
      recordBrand !== brandId ||
      organization !== context.organization.id ||
      record.isDeleted ||
      !['GENERATED', 'VALIDATED', 'UPLOADED'].includes(record.status) ||
      !['IMAGE', 'VIDEO', 'GIF', 'MUSIC', 'VOICE', 'AUDIO'].includes(category)
    )
      continue;
    const kind =
      category === 'VIDEO'
        ? 'video'
        : ['MUSIC', 'VOICE', 'AUDIO'].includes(category)
          ? 'audio'
          : 'image';
    const url = record.ingredientUrl || record.cdnUrl;
    const name =
      record.metadataLabel ||
      (typeof record.metadata === 'object'
        ? record.metadata?.label
        : undefined) ||
      `${category.charAt(0)}${category.slice(1).toLowerCase()} ${record.id.slice(0, 8)}`;
    items.push({
      id: record.id,
      brandId,
      contentTitle: name,
      contentType: category.charAt(0) + category.slice(1).toLowerCase(),
      kind,
      thumbnailUrl:
        record.thumbnailUrl ||
        (kind === 'image' ? (url ?? undefined) : undefined),
      reference: {
        kind: 'ingredient',
        serializer: 'ingredient',
        recordId: record.id,
        organizationId: organization,
        brandId,
        ...(record.version !== undefined
          ? { recordVersion: String(record.version) }
          : {}),
      },
    });
  }
  return {
    items,
    hasMore: page < Number(document.links?.pagination?.pages ?? 1),
  };
}

export function libraryArtifactReferences(
  items: readonly LibraryAsset[],
  brandId: string,
): AgentArtifactReference[] {
  return items
    .filter(
      (item) => item.brandId === brandId && item.reference.brandId === brandId,
    )
    .map((item) => item.reference);
}

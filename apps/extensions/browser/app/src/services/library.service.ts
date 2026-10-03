import type {
  AgentArtifactReference,
  IIngredient,
  LibraryAsset,
  LibraryDelivery,
  LibraryHandoffOptions,
  LibraryLoadOptions,
  LibraryPage,
} from '@genfeedai/contracts/interfaces';
import {
  deserializeCollection,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { apiEndpoint } from '~services/environment.service';
import {
  assertWorkspace,
  requireWorkspace,
  scopedWorkspaceRequest,
} from '~services/workspace.service';

export type { LibraryAsset } from '@genfeedai/contracts/interfaces';

export async function loadLibraryAssets(
  brandId: string,
  options: LibraryLoadOptions = {},
): Promise<LibraryPage> {
  if (!brandId.trim())
    throw new Error('Select a brand to browse your Library.');
  const workspace = await requireWorkspace();
  if (
    brandId !== workspace.brandId ||
    !workspace.brands.some((brand) => brand.id === brandId)
  )
    throw new Error('Select an accessible brand to load your Library.');
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
  if (options.search?.trim()) query.set('search', options.search.trim());
  const response = await scopedWorkspaceRequest(
    `/ingredients?${query}`,
    { signal: options.signal },
    workspace,
  );
  const document = (await response.json()) as JsonApiResponseDocument & {
    message?: string;
  };
  if (!response.ok)
    throw new Error(document.message || 'Could not load your Library.');
  assertWorkspace(workspace);
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
      organization !== workspace.organizationId ||
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
        ...(record.version !== undefined && record.version !== null
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

export async function resolveLibraryAssetDelivery(
  reference: AgentArtifactReference,
  options: LibraryHandoffOptions = {},
): Promise<LibraryDelivery> {
  const workspace = await requireWorkspace();
  const unavailable =
    'This asset changed or is unavailable. Remove it and select its current Library version.';
  if (
    reference.kind !== 'ingredient' ||
    reference.serializer !== 'ingredient' ||
    !reference.recordId.trim() ||
    !workspace.brandId ||
    reference.organizationId !== workspace.organizationId ||
    reference.brandId !== workspace.brandId
  )
    throw new Error(unavailable);
  options.signal?.throwIfAborted();
  const query = new URLSearchParams({ ids: reference.recordId });
  const response = await scopedWorkspaceRequest(
    `/ingredients/batch?${query}`,
    { signal: options.signal },
    workspace,
  );
  if (!response.ok)
    throw new Error('Could not retrieve this asset. Retry in your Library.');
  const document = (await response.json()) as JsonApiResponseDocument;
  assertWorkspace(workspace);
  options.signal?.throwIfAborted();
  const records = deserializeCollection<IIngredient>(document);
  const record = records[0];
  const organization =
    record?.organizationId ??
    (typeof record?.organization === 'string'
      ? record.organization
      : record?.organization?.id);
  const brand =
    record?.brandId ??
    (typeof record?.brand === 'string' ? record.brand : record?.brand?.id);
  const version =
    record?.version === undefined || record.version === null
      ? undefined
      : String(record.version);
  if (
    records.length !== 1 ||
    !record ||
    record.id !== reference.recordId ||
    organization !== workspace.organizationId ||
    brand !== workspace.brandId ||
    record.isDeleted === true ||
    !['GENERATED', 'VALIDATED', 'UPLOADED'].includes(record.status) ||
    !['IMAGE', 'VIDEO', 'GIF', 'MUSIC', 'VOICE', 'AUDIO'].includes(
      record.category?.toUpperCase(),
    ) ||
    version !== reference.recordVersion
  )
    throw new Error(unavailable);
  let url: URL;
  try {
    url = new URL(record.cdnUrl ?? '');
  } catch {
    throw new Error(unavailable);
  }
  const api = new URL(apiEndpoint);
  const localHttp =
    url.protocol === 'http:' &&
    url.origin === api.origin &&
    ['localhost', '127.0.0.1', '[::1]', 'genfeed.localhost'].includes(
      api.hostname,
    );
  if (url.username || url.password || (url.protocol !== 'https:' && !localHttp))
    throw new Error(unavailable);
  return { reference, url: url.href };
}

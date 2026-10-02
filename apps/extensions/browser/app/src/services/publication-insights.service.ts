import type {
  LinkExternalPublicationCredentialResult,
  PublicationInsight,
} from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import type {
  ExtensionPublicationInsightPage,
  ExtensionPublicationInsightRequestOptions,
  ExtensionPublicationInsightsErrorCode,
  ExtensionPublicationPageLookup,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-insights.interface';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { z } from 'zod';
import { parsePublicationInsight } from '~services/publication-insights-validation';
import {
  assertWorkspace,
  scopedWorkspaceRequest,
} from '~services/workspace.service';

export class PublicationInsightsRequestError extends Error {
  constructor(
    readonly code: ExtensionPublicationInsightsErrorCode,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'PublicationInsightsRequestError';
  }
}
const failure = 'Could not load this publication. Retry.';
const linkFailure =
  'Could not link this account. Reload this publication and choose a matching account.';
function invalid(): PublicationInsightsRequestError {
  return new PublicationInsightsRequestError('invalid-response', null, failure);
}
function scoped(
  options: ExtensionPublicationInsightRequestOptions,
  insight?: PublicationInsight,
): string {
  options.signal?.throwIfAborted();
  assertWorkspace(options.snapshot);
  const brandId = options.snapshot.brandId;
  if (
    !brandId ||
    (insight &&
      (insight.organizationId !== options.snapshot.organizationId ||
        insight.brandId !== brandId))
  )
    throw new PublicationInsightsRequestError(
      'forbidden',
      null,
      'Your account or workspace changed. Retry after workspace synchronization.',
    );
  return brandId;
}
async function request(
  path: string,
  init: RequestInit,
  options: ExtensionPublicationInsightRequestOptions,
  operation: 'list' | 'detail' | 'refresh' | 'link',
): Promise<unknown> {
  scoped(options);
  let response: Response;
  let body: unknown;
  try {
    response = await scopedWorkspaceRequest(
      path,
      { ...init, signal: options.signal },
      options.snapshot,
    );
    body = await response.json();
  } catch (error) {
    options.signal?.throwIfAborted();
    assertWorkspace(options.snapshot);
    if (error instanceof PublicationInsightsRequestError) throw error;
    throw new PublicationInsightsRequestError(
      'request-failed',
      null,
      operation === 'link' ? linkFailure : failure,
    );
  }
  options.signal?.throwIfAborted();
  assertWorkspace(options.snapshot);
  if (response.ok) return body;
  const status = response.status;
  if (status === 401 || status === 403)
    throw new PublicationInsightsRequestError(
      'forbidden',
      status,
      'Your account or workspace changed. Retry after workspace synchronization.',
    );
  if (status === 404 && operation === 'list')
    throw new PublicationInsightsRequestError(
      'unavailable',
      status,
      'Insights are not available on this server yet. Retry after Genfeed is updated.',
    );
  if (status === 404 && operation === 'detail')
    throw new PublicationInsightsRequestError(
      'not-found',
      status,
      'This publication is no longer available.',
    );
  if (status === 429 && operation === 'refresh') {
    const envelope = z
      .object({
        detail: z.string().optional(),
        errors: z.array(z.object({ detail: z.string().optional() })).optional(),
      })
      .safeParse(body);
    const detail = envelope.success
      ? (envelope.data.detail ?? envelope.data.errors?.[0]?.detail)
      : undefined;
    const minutes = detail?.match(
      /^Analytics can only be refreshed once per hour\. Please try again in ([1-9]|[1-5][0-9]|60) minutes\.$/,
    );
    throw new PublicationInsightsRequestError(
      'rate-limited',
      status,
      minutes
        ? (detail as string)
        : 'Analytics can only be refreshed once per hour. Try again later.',
    );
  }
  throw new PublicationInsightsRequestError(
    'request-failed',
    status,
    operation === 'link' ? linkFailure : failure,
  );
}
const resource = z.object({
  id: z.string().min(1),
  type: z.literal('publication-insight'),
  attributes: z.record(z.string(), z.unknown()),
});
function document(
  value: unknown,
  collection: boolean,
): JsonApiResponseDocument {
  const parsed = z
    .object({ data: collection ? z.array(resource) : resource })
    .safeParse(value);
  if (!parsed.success) throw invalid();
  return value as JsonApiResponseDocument;
}
export async function loadPublicationInsightPage(
  lookup: ExtensionPublicationPageLookup,
  page: number,
  options: ExtensionPublicationInsightRequestOptions,
): Promise<ExtensionPublicationInsightPage> {
  const brandId = scoped(options);
  if (!Number.isInteger(page) || page < 1) throw invalid();
  const query = new URLSearchParams({
    brandId,
    platform: lookup.platform,
    pageUrl: lookup.pageUrl,
    page: String(page),
    limit: '10',
  });
  const value = await request(
    `/posts/publication-insights?${query}`,
    {},
    options,
    'list',
  );
  try {
    const doc = document(value, true);
    const pagination = z
      .object({
        page: z.number().int().positive(),
        limit: z.literal(10),
        total: z.number().int().nonnegative(),
        pages: z.number().int().nonnegative(),
      })
      .parse(doc.links?.pagination);
    const items = deserializeCollection<unknown>(doc).map((item) =>
      parsePublicationInsight(item, options.snapshot, lookup.platform),
    );
    if (
      pagination.page !== page ||
      pagination.pages !== Math.ceil(pagination.total / 10) ||
      items.length > 10 ||
      items.length > pagination.total
    )
      throw invalid();
    options.signal?.throwIfAborted();
    assertWorkspace(options.snapshot);
    return { ...pagination, items };
  } catch {
    options.signal?.throwIfAborted();
    assertWorkspace(options.snapshot);
    throw invalid();
  }
}
export async function loadPublicationInsight(
  postId: string,
  options: ExtensionPublicationInsightRequestOptions,
): Promise<PublicationInsight> {
  const brandId = scoped(options);
  if (!postId.trim()) throw invalid();
  const query = new URLSearchParams({ brandId });
  const value = await request(
    `/posts/${encodeURIComponent(postId)}/publication-insights?${query}`,
    {},
    options,
    'detail',
  );
  try {
    const insight = parsePublicationInsight(
      deserializeResource<unknown>(document(value, false)),
      options.snapshot,
    );
    if (insight.id !== postId) throw invalid();
    options.signal?.throwIfAborted();
    assertWorkspace(options.snapshot);
    return insight;
  } catch {
    options.signal?.throwIfAborted();
    assertWorkspace(options.snapshot);
    throw invalid();
  }
}
export async function refreshPublicationInsight(
  insight: PublicationInsight,
  options: ExtensionPublicationInsightRequestOptions,
): Promise<void> {
  const brandId = scoped(options, insight);
  if (insight.analyticsAvailability !== 'eligible')
    throw new PublicationInsightsRequestError(
      'request-failed',
      null,
      'Analytics unavailable.',
    );
  await request(
    `/posts/${encodeURIComponent(insight.id)}/refresh-analytics?${new URLSearchParams({ brandId })}`,
    { method: 'POST' },
    options,
    'refresh',
  );
  options.signal?.throwIfAborted();
  assertWorkspace(options.snapshot);
}
export async function linkPublicationInsightCredential(
  insight: PublicationInsight,
  credentialId: string,
  options: ExtensionPublicationInsightRequestOptions,
): Promise<LinkExternalPublicationCredentialResult> {
  const brandId = scoped(options, insight);
  if (
    !insight.isCapturedObservation ||
    insight.credentialId !== null ||
    !insight.linkCandidates.some((candidate) => candidate.id === credentialId)
  )
    throw new PublicationInsightsRequestError(
      'request-failed',
      null,
      linkFailure,
    );
  const result = await request(
    '/agent-tools/link_external_publication_credential/execute',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parameters: { brandId, postId: insight.id, credentialId },
        context: { brandId },
      }),
    },
    options,
    'link',
  );
  const parsed = z
    .object({
      success: z.literal(true),
      data: z.object({
        postId: z.literal(insight.id),
        credentialId: z.literal(credentialId),
        analyticsAvailability: z.enum([
          'eligible',
          'missing-external-id',
          'missing-credential',
          'unsupported-platform',
          'unsupported-publication-kind',
          'provider-id-unresolved',
        ]),
      }),
    })
    .safeParse(result);
  if (!parsed.success) throw invalid();
  options.signal?.throwIfAborted();
  assertWorkspace(options.snapshot);
  return parsed.data.data;
}

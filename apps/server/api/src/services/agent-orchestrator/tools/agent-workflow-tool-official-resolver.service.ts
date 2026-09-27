import { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { tokenizeWorkflowBootstrapText } from '@api/services/agent-orchestrator/tools/agent-workflow-tool.helpers';
import type {
  OfficialWorkflowSource,
  OfficialWorkflowSourceKind,
  RecurringTaskContentType,
} from '@api/services/agent-orchestrator/tools/agent-workflow-tool.types';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Resolves which official workflow (system catalog entry, seeded template, or
 * marketplace listing) best matches an agent's install/bootstrap request, and
 * infers the recurring content type driving that match (#2250).
 *
 * Extracted from `AgentWorkflowToolInstallService` (#519/#520) to keep that
 * file focused on the install/confirmation flow rather than source scoring.
 */
@Injectable()
export class AgentWorkflowToolOfficialResolverService {
  constructor(
    private readonly systemWorkflowCatalogService: SystemWorkflowCatalogService,
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly marketplaceApiClient?: MarketplaceApiClient,
  ) {}

  /**
   * An explicit `sourceId`/`sourceType` pair (as sent back through a
   * confirmation card payload) is trusted outright; otherwise the request is
   * scored against the catalog, seeded templates, and the marketplace.
   */
  async resolveInstallSource(
    params: Record<string, unknown>,
    organizationId: string,
  ): Promise<OfficialWorkflowSource | null> {
    if (
      typeof params.sourceId === 'string' &&
      typeof params.sourceType === 'string' &&
      params.sourceId.trim() &&
      params.sourceType.trim()
    ) {
      return {
        confidence: 999,
        description:
          typeof params.sourceDescription === 'string'
            ? params.sourceDescription
            : undefined,
        id: params.sourceId,
        kind: params.sourceType as OfficialWorkflowSourceKind,
        name:
          typeof params.sourceName === 'string' && params.sourceName.trim()
            ? params.sourceName
            : 'Official workflow',
        slug:
          typeof params.sourceSlug === 'string' ? params.sourceSlug : undefined,
      };
    }

    return this.resolveOfficialWorkflowSource(params, organizationId);
  }

  inferBootstrapContentType(
    params: Record<string, unknown>,
  ): RecurringTaskContentType {
    const explicitType =
      typeof params.contentType === 'string'
        ? params.contentType.toLowerCase()
        : null;

    if (
      explicitType === 'image' ||
      explicitType === 'video' ||
      explicitType === 'post' ||
      explicitType === 'newsletter'
    ) {
      return explicitType;
    }

    const corpus = tokenizeWorkflowBootstrapText(
      params.prompt,
      params.label,
      params.name,
      params.platform,
      params.description,
    ).join(' ');

    if (
      corpus.includes('newsletter') ||
      corpus.includes('article') ||
      corpus.includes('blog')
    ) {
      return 'newsletter';
    }

    if (
      corpus.includes('video') ||
      corpus.includes('reel') ||
      corpus.includes('tiktok') ||
      corpus.includes('short')
    ) {
      return 'video';
    }

    if (
      corpus.includes('image') ||
      corpus.includes('graphic') ||
      corpus.includes('visual')
    ) {
      return 'image';
    }

    return 'post';
  }

  private async resolveOfficialWorkflowSource(
    params: Record<string, unknown>,
    organizationId: string,
  ): Promise<OfficialWorkflowSource | null> {
    const bestSeeded = await this.resolveBestOwnedOfficialSource(
      params,
      organizationId,
    );

    if (bestSeeded && bestSeeded.confidence >= 112) {
      return bestSeeded;
    }

    if (!this.marketplaceApiClient) {
      return bestSeeded && bestSeeded.confidence >= 104 ? bestSeeded : null;
    }

    const bestMarketplace = await this.resolveBestMarketplaceSource(params);

    if (bestMarketplace && bestMarketplace.confidence >= 104) {
      return bestMarketplace;
    }

    return bestSeeded && bestSeeded.confidence >= 104 ? bestSeeded : null;
  }

  private async resolveBestOwnedOfficialSource(
    params: Record<string, unknown>,
    organizationId: string,
  ): Promise<OfficialWorkflowSource | undefined> {
    const catalog =
      await this.systemWorkflowCatalogService.listCatalogForOrganization(
        organizationId,
      );
    const catalogCandidates: OfficialWorkflowSource[] = catalog
      .filter((entry) => entry.installable)
      .map((entry) => ({
        confidence: this.scoreOfficialWorkflowSource(
          {
            description: entry.description,
            kind: 'system-catalog',
            name: entry.label,
          },
          params,
        ),
        description: entry.description,
        id: entry.canonicalId,
        installedWorkflowId: entry.installedWorkflowId ?? undefined,
        kind: 'system-catalog',
        name: entry.label,
      }));

    const templates = await this.workflowsService.getWorkflowTemplates();
    const seededCandidates: OfficialWorkflowSource[] = templates.map(
      (template) => ({
        confidence: this.scoreOfficialWorkflowSource(
          {
            description: template.description,
            kind: 'seeded-template',
            name: template.name,
          },
          params,
        ),
        description: template.description,
        id: template.id,
        kind: 'seeded-template',
        name: template.name,
      }),
    );

    // Catalog entries lead the array so the stable sort keeps them ahead of a
    // seeded template that ties on confidence — the code-owned canonical graph
    // is the one we want installed.
    return [...catalogCandidates, ...seededCandidates].sort(
      (left, right) => right.confidence - left.confidence,
    )[0];
  }

  private async resolveBestMarketplaceSource(
    params: Record<string, unknown>,
  ): Promise<OfficialWorkflowSource | undefined> {
    const listingQuery = tokenizeWorkflowBootstrapText(
      params.prompt,
      params.label,
      params.name,
      params.platform,
    ).join(' ');

    const officialListings = await this.marketplaceApiClient?.searchListings({
      isOfficial: true,
      limit: 12,
      search: listingQuery || undefined,
      sort: '-publishedAt',
      type: 'workflow',
    });

    const listingDocs = Array.isArray(
      (officialListings as { docs?: unknown[] } | undefined)?.docs,
    )
      ? (((
          officialListings as unknown as {
            docs: Array<Record<string, unknown>>;
          }
        ).docs ?? []) as Array<Record<string, unknown>>)
      : [];

    const marketplaceCandidates: OfficialWorkflowSource[] = listingDocs.map(
      (listing) => ({
        confidence: this.scoreOfficialWorkflowSource(
          {
            description:
              (listing.shortDescription as string | undefined) ||
              (listing.description as string | undefined),
            kind: 'marketplace-listing',
            name: String(listing.title || ''),
          },
          params,
        ),
        description:
          (listing.shortDescription as string | undefined) ||
          (listing.description as string | undefined),
        id: String(listing._id || ''),
        kind: 'marketplace-listing',
        name: String(listing.title || 'Official workflow'),
        price: typeof listing.price === 'number' ? listing.price : Number.NaN,
        pricingTier:
          typeof listing.pricingTier === 'string'
            ? listing.pricingTier
            : undefined,
        slug: typeof listing.slug === 'string' ? listing.slug : undefined,
      }),
    );

    return marketplaceCandidates.sort(
      (left, right) => right.confidence - left.confidence,
    )[0];
  }

  private scoreOfficialWorkflowSource(
    source: Pick<OfficialWorkflowSource, 'description' | 'kind' | 'name'>,
    params: Record<string, unknown>,
  ): number {
    const queryTokens = tokenizeWorkflowBootstrapText(
      params.prompt,
      params.label,
      params.name,
      params.platform,
      params.contentType,
    );
    const haystack = tokenizeWorkflowBootstrapText(
      source.name,
      source.description,
    );
    const haystackSet = new Set(haystack);

    // Code-owned sources (seeded templates and the system catalog) start ahead
    // of marketplace listings; the catalog shares the seeded base so the
    // existing confidence thresholds keep their meaning.
    let score = source.kind === 'marketplace-listing' ? 50 : 100;
    for (const token of queryTokens) {
      if (haystackSet.has(token)) {
        score += 8;
      }
    }

    const contentType = this.inferBootstrapContentType(params);
    if (
      contentType === 'post' &&
      haystack.some((token) =>
        ['content', 'linkedin', 'social', 'twitter', 'post'].includes(token),
      )
    ) {
      score += 12;
    }

    if (contentType === 'video' && haystack.includes('video')) {
      score += 12;
    }

    if (contentType === 'image' && haystack.includes('image')) {
      score += 12;
    }

    if (
      contentType === 'newsletter' &&
      haystack.some((token) => ['article', 'newsletter'].includes(token))
    ) {
      score += 12;
    }

    const platform =
      typeof params.platform === 'string' ? params.platform.toLowerCase() : '';
    if (platform && haystack.includes(platform)) {
      score += 16;
    }

    return score;
  }
}

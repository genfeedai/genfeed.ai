import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  type KnowledgeReceipt,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  type KnowledgeSourceKind,
  type KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

const SEARCH_MAX_PASSAGES = 12;

export interface KnowledgeGroundingPassage {
  citation?: {
    endMs?: number;
    kind?: string;
    mediaUrl?: string;
    purpose?: string;
    sourceId?: string;
    startMs?: number;
    title?: string;
    url?: string;
    version?: number;
    versionId?: string;
  };
  content?: string;
  relevance?: number;
}

export interface KnowledgeGroundingInput {
  passages?: KnowledgeGroundingPassage[];
  query?: string;
}

@Injectable()
export class WorkflowKnowledgeGroundingService {
  constructor(private readonly prisma: PrismaService) {}

  async hydrateReceipts(input: {
    brandId: string;
    knowledge: KnowledgeGroundingInput;
    organizationId: string;
  }): Promise<{ query: string; receipts: KnowledgeReceipt[] }> {
    const query =
      typeof input.knowledge.query === 'string'
        ? input.knowledge.query.trim()
        : '';
    const passages = Array.isArray(input.knowledge.passages)
      ? input.knowledge.passages
      : [];
    if (!query || passages.length === 0) {
      throw new Error(
        'Knowledge-grounded generation requires a query and at least one cited passage',
      );
    }
    if (passages.length > SEARCH_MAX_PASSAGES) {
      throw new Error(
        `Knowledge-grounded generation accepts at most ${SEARCH_MAX_PASSAGES} passages`,
      );
    }

    const receipts: KnowledgeReceipt[] = [];
    for (const passage of passages) {
      receipts.push(
        await this.hydratePassage({
          brandId: input.brandId,
          organizationId: input.organizationId,
          passage,
        }),
      );
    }
    return { query, receipts };
  }

  private async hydratePassage(input: {
    brandId: string;
    organizationId: string;
    passage: KnowledgeGroundingPassage;
  }): Promise<KnowledgeReceipt> {
    const content =
      typeof input.passage.content === 'string'
        ? input.passage.content
        : undefined;
    const sourceId =
      typeof input.passage.citation?.sourceId === 'string'
        ? input.passage.citation.sourceId
        : undefined;
    const versionId =
      typeof input.passage.citation?.versionId === 'string'
        ? input.passage.citation.versionId
        : undefined;
    const relevance =
      typeof input.passage.relevance === 'number'
        ? input.passage.relevance
        : undefined;
    if (!content || !sourceId || !versionId || relevance === undefined) {
      throw new Error('Knowledge citation is invalid');
    }

    const startMs =
      typeof input.passage.citation?.startMs === 'number'
        ? input.passage.citation.startMs
        : undefined;
    const endMs =
      typeof input.passage.citation?.endMs === 'number'
        ? input.passage.citation.endMs
        : undefined;

    const chunk = await this.prisma.contextEntry.findFirst({
      include: {
        knowledgeSourceVersion: {
          include: {
            source: true,
          },
        },
      },
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        knowledgeSourceId: sourceId,
        knowledgeSourceVersionId: versionId,
        data: {
          path: ['content'],
          equals: content,
        },
        knowledgeSourceVersion: {
          isDeleted: false,
          isCurrent: true,
          processingState: KnowledgeProcessingState.READY,
          retrievalState: KnowledgeRetrievalState.ACTIVE,
          retentionState: KnowledgeRetentionState.RETAINED,
          organizationId: input.organizationId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          source: {
            isDeleted: false,
            isVisible: true,
            organizationId: input.organizationId,
            OR: [
              {
                scope: KnowledgeMemoryScope.ORG,
                brandId: null,
              },
              {
                scope: KnowledgeMemoryScope.BRAND,
                brandId: input.brandId,
              },
            ],
          },
        },
      },
    });

    const version = chunk?.knowledgeSourceVersion;
    const source = version?.source;
    if (!chunk || !version || !source) {
      throw new Error('Knowledge citation is invalid');
    }

    const metadata =
      chunk.data && typeof chunk.data === 'object' && !Array.isArray(chunk.data)
        ? (chunk.data as { metadata?: Record<string, unknown> }).metadata
        : undefined;
    const metadataStart =
      typeof metadata?.startMs === 'number' ? metadata.startMs : undefined;
    const metadataEnd =
      typeof metadata?.endMs === 'number' ? metadata.endMs : undefined;
    if (
      (startMs !== undefined && metadataStart !== startMs) ||
      (endMs !== undefined && metadataEnd !== endMs)
    ) {
      throw new Error('Knowledge citation is invalid');
    }

    const provenance =
      version.provenance &&
      typeof version.provenance === 'object' &&
      !Array.isArray(version.provenance)
        ? (version.provenance as Record<string, unknown>)
        : {};
    const url =
      typeof provenance.url === 'string'
        ? provenance.url
        : typeof metadata?.referenceUrl === 'string'
          ? metadata.referenceUrl
          : undefined;
    const mediaUrl =
      typeof metadata?.mediaUrl === 'string' ? metadata.mediaUrl : undefined;

    return {
      excerpt: content,
      kind: source.kind as KnowledgeSourceKind,
      purpose: source.purpose as KnowledgeSourcePurpose,
      relevance,
      sourceId: source.id,
      title: source.title,
      version: version.version,
      versionId: version.id,
      ...(url ? { url } : {}),
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(metadataStart !== undefined ? { startMs: metadataStart } : {}),
      ...(metadataEnd !== undefined ? { endMs: metadataEnd } : {}),
    };
  }
}

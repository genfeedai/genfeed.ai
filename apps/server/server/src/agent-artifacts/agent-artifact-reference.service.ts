import { createHash, randomUUID } from 'node:crypto';
import type {
  AgentArtifactRecordKind,
  AgentArtifactReference,
  AgentArtifactReferenceReadContext,
  AgentArtifactSerializer,
  AgentArtifactVersionPin,
  ResolvedAgentArtifactReference,
} from '@genfeedai/interfaces';
import { AGENT_ARTIFACT_SERIALIZER_BY_KIND } from '@genfeedai/interfaces';
import type { ContentVersionPin } from '@genfeedai/prisma';
import {
  ArticleSerializer,
  AssetSerializer,
  ContentDraftSerializer,
  IngredientSerializer,
  NewsletterSerializer,
  PostSerializer,
} from '@genfeedai/serializers';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPrisma,
} from '@server/server.dependencies';

const CONTENT_DIGEST_PREFIX = 'sha256:v1:';
const IDEMPOTENCY_KEY_PREFIX = 'content-version-pin:v1:';
const MAX_LEGACY_REFERENCE_USES = 20;
const MAX_LEGACY_REFERENCE_CANDIDATES = 20;
const POST_MATERIAL_FIELDS = [
  'brandId',
  'category',
  'credentialId',
  'description',
  'entityArticleId',
  'entityIngredientId',
  'entityModel',
  'groupId',
  'id',
  'isRepeat',
  'isShareToFeedSelected',
  'label',
  'maxRepeats',
  'nextScheduledDate',
  'order',
  'originalPostId',
  'parentId',
  'platform',
  'publishIntent',
  'quoteTweetId',
  'repeatDaysOfWeek',
  'repeatEndDate',
  'repeatFrequency',
  'repeatInterval',
  'scheduleSlot',
  'scheduledDate',
  'targetAttachments',
  'targetSettings',
  'timezone',
  'variantId',
] as const;
const POST_INGREDIENT_MATERIAL_FIELDS = [
  'category',
  'cdnUrl',
  'fileSize',
  'id',
  'mimeType',
  's3Key',
  'version',
] as const;

type CanonicalRecord = Record<string, unknown>;

type LegacyReferenceSource = 'ui-action-content-id' | 'ui-action-ingredient-id';

export interface AgentArtifactReferenceTelemetryContext {
  client: string;
  deployment: string;
  isInternal?: boolean;
  isKnownBot?: boolean;
}

export interface CreateOrReuseVersionPinParams {
  createdByUserId: string;
  reference: AgentArtifactReference;
}

export interface AssertVersionPinCurrentParams {
  pinId: string;
  readContext: AgentArtifactReferenceReadContext;
}

export interface ResolveMessageArtifactReferencesParams {
  messageId: string;
  readContext: AgentArtifactReferenceReadContext;
  telemetry?: AgentArtifactReferenceTelemetryContext;
}

interface CanonicalRecordState {
  brandId?: string;
  material: CanonicalRecord;
  record: CanonicalRecord;
  recordVersion?: string;
}

interface LegacyReferenceCandidate {
  kind: AgentArtifactRecordKind;
  recordId: string;
  source: LegacyReferenceSource;
}

const SERIALIZERS = {
  article: ArticleSerializer,
  asset: AssetSerializer,
  'content-draft': ContentDraftSerializer,
  ingredient: IngredientSerializer,
  newsletter: NewsletterSerializer,
  post: PostSerializer,
} as const;

function artifactNotFound(label: string, id: string): HttpException {
  return new HttpException(
    {
      detail: `${label} with identifier '${id}' was not found in the authorized scope.`,
      source: { parameter: id },
      title: 'Resource Not Found',
    },
    HttpStatus.NOT_FOUND,
  );
}

/**
 * Resolves a closed set of typed references over existing canonical records.
 * ContentVersionPin is the only persistence introduced here; it stores identity
 * and a digest, never a copied content payload or parallel lifecycle state.
 */
@Injectable()
export class AgentArtifactReferenceService {
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<
      ServerPrisma,
      | 'agentMessage'
      | 'article'
      | 'asset'
      | 'brand'
      | 'contentDraft'
      | 'contentVersionPin'
      | 'ingredient'
      | 'member'
      | 'newsletter'
      | 'organization'
      | 'post'
    >,
    @Inject(SERVER_TOKENS.logger)
    @Optional()
    private readonly logger?: ServerLogger,
  ) {}

  async resolveReference(
    reference: AgentArtifactReference,
    readContext: AgentArtifactReferenceReadContext,
  ): Promise<ResolvedAgentArtifactReference> {
    this.assertReferenceContract(reference, readContext);
    const canonical = await this.loadCanonicalRecord(
      reference.kind,
      reference.recordId,
      reference.organizationId,
    );
    this.assertCanonicalScope(reference, canonical.brandId);

    return {
      reference,
      serialized: SERIALIZERS[reference.kind].serialize(
        this.normalizeForSerializer(reference.kind, canonical.record),
      ),
      source: 'canonical',
    };
  }

  async createOrReuseVersionPin(
    params: CreateOrReuseVersionPinParams,
  ): Promise<AgentArtifactVersionPin> {
    const readContext: AgentArtifactReferenceReadContext = {
      brandId: params.reference.brandId,
      organizationId: params.reference.organizationId,
    };
    this.assertReferenceContract(params.reference, readContext);
    await this.assertActorAuthorized(
      params.createdByUserId,
      params.reference.organizationId,
    );

    const canonical = await this.loadCanonicalRecord(
      params.reference.kind,
      params.reference.recordId,
      params.reference.organizationId,
    );
    this.assertCanonicalScope(params.reference, canonical.brandId);

    if (
      params.reference.kind === 'asset' &&
      typeof canonical.recordVersion !== 'string'
    ) {
      throw new ConflictException(
        'Asset version pinning requires a canonical sha256 value.',
      );
    }

    const contentDigest = this.digestMaterial(canonical.material);
    const idempotencyKey = this.buildIdempotencyKey(
      params.reference,
      contentDigest,
    );
    const existing = await this.findPinByIdempotencyKey(
      params.reference.organizationId,
      idempotencyKey,
    );
    if (existing) {
      return this.toVersionPin(existing);
    }

    const id = randomUUID();
    try {
      const created = await this.prisma.contentVersionPin.create({
        data: {
          brandId: params.reference.brandId ?? null,
          contentDigest,
          createdByUserId: params.createdByUserId,
          id,
          idempotencyKey,
          organizationId: params.reference.organizationId,
          provenance: {
            contractVersion: 1,
            serializer: params.reference.serializer,
            source: 'version-bound-policy',
          },
          recordId: params.reference.recordId,
          recordKind: params.reference.kind,
          ...(canonical.recordVersion
            ? { recordVersion: canonical.recordVersion }
            : {}),
        },
      });
      return this.toVersionPin(created);
    } catch (error: unknown) {
      if ((error as { code?: unknown }).code !== 'P2002') {
        throw error;
      }

      const winner = await this.findPinByIdempotencyKey(
        params.reference.organizationId,
        idempotencyKey,
      );
      if (!winner) {
        throw error;
      }
      return this.toVersionPin(winner);
    }
  }

  async resolveVersionPin(
    params: AssertVersionPinCurrentParams,
  ): Promise<ResolvedAgentArtifactReference> {
    const pin = await this.prisma.contentVersionPin.findFirst({
      where: {
        ...(params.readContext.brandId
          ? { brandId: params.readContext.brandId }
          : {}),
        id: params.pinId,
        organizationId: params.readContext.organizationId,
      },
    });
    if (!pin) {
      throw artifactNotFound('Content version pin', params.pinId);
    }

    const reference = this.referenceFromPin(pin);
    this.assertReferenceContract(reference, params.readContext);
    const resolved = await this.resolveReference(reference, params.readContext);

    return {
      ...resolved,
      versionPin: this.toVersionPin(pin),
    };
  }

  async assertVersionPinCurrent(
    params: AssertVersionPinCurrentParams,
  ): Promise<ResolvedAgentArtifactReference> {
    const resolved = await this.resolveVersionPin(params);
    const pin = resolved.versionPin;
    if (!pin) {
      throw artifactNotFound('Content version pin', params.pinId);
    }

    const canonical = await this.loadCanonicalRecord(
      pin.kind,
      pin.recordId,
      pin.organizationId,
    );
    const currentDigest = this.digestMaterial(canonical.material);
    if (currentDigest !== pin.contentDigest) {
      throw new ConflictException({
        code: 'content_version_pin_mismatch',
        detail:
          'The canonical record changed after review. Create and approve a new version pin before execution.',
        pinId: pin.id,
        title: 'Approved content version is stale',
      });
    }

    return resolved;
  }

  async resolveMessageReferences(
    params: ResolveMessageArtifactReferencesParams,
  ): Promise<ResolvedAgentArtifactReference[]> {
    const message = await this.prisma.agentMessage.findFirst({
      where: {
        id: params.messageId,
        isDeleted: false,
        organizationId: params.readContext.organizationId,
      },
    });
    if (!message) {
      throw artifactNotFound('Agent message', params.messageId);
    }

    const typedReferences = this.readTypedReferences(
      message.artifactReferences,
    );
    if (typedReferences.length > 0) {
      await this.prisma.agentMessage.updateMany({
        data: { artifactReferenceEligibleReadCount: { increment: 1 } },
        where: {
          id: message.id,
          isDeleted: false,
          organizationId: params.readContext.organizationId,
        },
      });
      this.recordReferenceTelemetry('canonical', params);
      return Promise.all(
        typedReferences.map((reference) =>
          this.resolveReference(reference, params.readContext),
        ),
      );
    }

    if (!message.isLegacyArtifactReferenceEligible) {
      await this.prisma.agentMessage.updateMany({
        data: { artifactReferenceEligibleReadCount: { increment: 1 } },
        where: {
          id: message.id,
          isDeleted: false,
          organizationId: params.readContext.organizationId,
        },
      });
      this.recordReferenceTelemetry('none', params);
      return [];
    }

    if (message.legacyArtifactReferenceReadCount >= MAX_LEGACY_REFERENCE_USES) {
      throw new ConflictException({
        code: 'legacy_agent_artifact_reference_upgrade_required',
        detail:
          'This legacy message reference reached its bounded compatibility limit and must be linked to a canonical record.',
        title: 'Legacy artifact reference upgrade required',
      });
    }

    const candidates = this.extractLegacyReferenceCandidates(message.metadata);
    const claimed = await this.prisma.agentMessage.updateMany({
      data: {
        artifactReferenceEligibleReadCount: { increment: 1 },
        legacyArtifactReferenceLastSource:
          candidates[0]?.source ?? 'unresolved-presentation-only',
        legacyArtifactReferenceLastUsedAt: new Date(),
        legacyArtifactReferenceReadCount: { increment: 1 },
      },
      where: {
        id: message.id,
        isDeleted: false,
        isLegacyArtifactReferenceEligible: true,
        legacyArtifactReferenceReadCount: { lt: MAX_LEGACY_REFERENCE_USES },
        organizationId: params.readContext.organizationId,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        code: 'legacy_agent_artifact_reference_upgrade_required',
        detail:
          'This legacy message reference is no longer available through compatibility resolution.',
        title: 'Legacy artifact reference upgrade required',
      });
    }

    this.recordReferenceTelemetry('legacy-message', params, {
      resolvedCandidateCount: candidates.length,
    });
    const resolved: ResolvedAgentArtifactReference[] = [];
    for (const candidate of candidates) {
      try {
        const state = await this.loadCanonicalRecord(
          candidate.kind,
          candidate.recordId,
          params.readContext.organizationId,
        );
        const reference = this.buildReference(
          candidate.kind,
          candidate.recordId,
          {
            brandId: state.brandId,
            organizationId: params.readContext.organizationId,
          },
        );
        const canonical = await this.resolveReference(
          reference,
          params.readContext,
        );
        resolved.push({ ...canonical, source: 'legacy-message' });
      } catch (error: unknown) {
        if (!(error instanceof HttpException)) {
          throw error;
        }
      }
    }

    return resolved;
  }

  async resolveReferencesFromMetadata(
    metadata: unknown,
    readContext: AgentArtifactReferenceReadContext,
  ): Promise<AgentArtifactReference[]> {
    const candidates = this.extractLegacyReferenceCandidates(metadata);
    const references: AgentArtifactReference[] = [];

    for (const candidate of candidates) {
      try {
        const canonical = await this.loadCanonicalRecord(
          candidate.kind,
          candidate.recordId,
          readContext.organizationId,
        );
        const reference = this.buildReference(
          candidate.kind,
          candidate.recordId,
          {
            brandId: canonical.brandId,
            organizationId: readContext.organizationId,
          },
        );
        this.assertReferenceContract(reference, {
          ...readContext,
          brandId: readContext.brandId ?? canonical.brandId,
        });
        references.push(reference);
      } catch (error: unknown) {
        if (!(error instanceof HttpException)) {
          throw error;
        }
      }
    }

    return this.dedupeReferences(references);
  }

  private async loadCanonicalRecord(
    kind: AgentArtifactRecordKind,
    recordId: string,
    organizationId: string,
  ): Promise<CanonicalRecordState> {
    switch (kind) {
      case 'article':
        return this.loadScopedRecord(
          'Article',
          this.prisma.article,
          recordId,
          organizationId,
          [
            'brandId',
            'category',
            'content',
            'coverImageUrl',
            'excerpt',
            'slug',
            'title',
          ],
        );
      case 'asset':
        return this.loadAsset(recordId, organizationId);
      case 'content-draft':
        return this.loadScopedRecord(
          'Content draft',
          this.prisma.contentDraft,
          recordId,
          organizationId,
          [
            'brandId',
            'content',
            'contentRunId',
            'data',
            'generatedBy',
            'mediaUrls',
            'metadata',
            'platforms',
            'skillSlug',
            'type',
          ],
        );
      case 'ingredient': {
        return this.loadIngredient(recordId, organizationId);
      }
      case 'newsletter':
        return this.loadScopedRecord(
          'Newsletter',
          this.prisma.newsletter,
          recordId,
          organizationId,
          [
            'angle',
            'brandId',
            'content',
            'contextNewsletterIds',
            'generationPrompt',
            'label',
            'scheduledFor',
            'sourceRefs',
            'summary',
            'topic',
          ],
        );
      case 'post':
        return this.loadPost(recordId, organizationId);
    }
  }

  private async loadIngredient(
    recordId: string,
    organizationId: string,
  ): Promise<CanonicalRecordState> {
    const result = await this.prisma.ingredient.findFirst({
      include: {
        metadata: true,
        prompt: true,
        sources: { select: { id: true } },
      },
      where: { id: recordId, isDeleted: false, organizationId },
    });
    if (!result) {
      throw artifactNotFound('Ingredient', recordId);
    }

    const record = result as unknown as CanonicalRecord;
    const sourceIds = Array.isArray(record.sources)
      ? record.sources
          .map((source) => this.readString(this.readRecord(source).id))
          .filter((id): id is string => Boolean(id))
          .sort()
      : [];
    const version = record.version;
    return {
      brandId: this.readString(record.brandId),
      material: {
        ...this.pick(record, [
          'brandId',
          'category',
          'cdnUrl',
          'externalVoiceId',
          'fileSize',
          'generationPrompt',
          'generationSeed',
          'generationSource',
          'mimeType',
          'modelUsed',
          'negativePrompt',
          'parentId',
          'promptTemplate',
          'providerData',
          's3Key',
          'sampleAudioUrl',
          'templateVersion',
          'version',
        ]),
        metadata: record.metadata,
        prompt: record.prompt,
        sourceIds,
      },
      record,
      recordVersion:
        typeof version === 'number' ? `ingredient:${version}` : undefined,
    };
  }

  private async loadPost(
    recordId: string,
    organizationId: string,
  ): Promise<CanonicalRecordState> {
    const result = await this.prisma.post.findFirst({
      include: {
        children: {
          include: {
            ingredients: {
              select: {
                category: true,
                cdnUrl: true,
                fileSize: true,
                id: true,
                mimeType: true,
                s3Key: true,
                version: true,
              },
            },
          },
          where: { isDeleted: false },
        },
        ingredients: {
          select: {
            category: true,
            cdnUrl: true,
            fileSize: true,
            id: true,
            mimeType: true,
            s3Key: true,
            version: true,
          },
        },
      },
      where: { id: recordId, isDeleted: false, organizationId },
    });
    if (!result) {
      throw artifactNotFound('Post', recordId);
    }

    const record = result as unknown as CanonicalRecord;
    const children = Array.isArray(record.children)
      ? record.children
          .map((child) => this.readRecord(child))
          .sort((left, right) => {
            const orderDelta =
              (typeof left.order === 'number' ? left.order : 0) -
              (typeof right.order === 'number' ? right.order : 0);
            return (
              orderDelta ||
              (this.readString(left.id) ?? '').localeCompare(
                this.readString(right.id) ?? '',
              )
            );
          })
          .map((child) => this.postMaterial(child))
      : [];

    return {
      brandId: this.readString(record.brandId),
      material: {
        ...this.postMaterial(record),
        children,
      },
      record,
    };
  }

  private postMaterial(record: CanonicalRecord): CanonicalRecord {
    const ingredients = Array.isArray(record.ingredients)
      ? record.ingredients
          .map((ingredient) =>
            this.pick(
              this.readRecord(ingredient),
              POST_INGREDIENT_MATERIAL_FIELDS,
            ),
          )
          .sort((left, right) =>
            (this.readString(left.id) ?? '').localeCompare(
              this.readString(right.id) ?? '',
            ),
          )
      : [];

    return {
      ...this.pick(record, POST_MATERIAL_FIELDS),
      ingredients,
    };
  }

  private async loadAsset(
    recordId: string,
    organizationId: string,
  ): Promise<CanonicalRecordState> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: recordId, isDeleted: false },
    });
    if (!asset) {
      throw artifactNotFound('Asset', recordId);
    }

    const record = asset as unknown as CanonicalRecord;
    let actualOrganizationId = this.readString(record.parentOrgId);
    let actualBrandId = this.readString(record.parentBrandId);
    const parentType = this.readString(record.parentType);

    if (parentType === 'BRAND') {
      if (!actualBrandId) {
        throw artifactNotFound('Asset', recordId);
      }
      const brand = await this.prisma.brand.findFirst({
        select: { id: true, organizationId: true },
        where: { id: actualBrandId, isDeleted: false, organizationId },
      });
      actualOrganizationId = brand?.organizationId;
    } else if (parentType === 'INGREDIENT') {
      const parentIngredientId = this.readString(record.parentIngredientId);
      if (!parentIngredientId) {
        throw artifactNotFound('Asset', recordId);
      }
      const parent = await this.prisma.ingredient.findFirst({
        select: { brandId: true, organizationId: true },
        where: {
          id: parentIngredientId,
          isDeleted: false,
          organizationId,
        },
      });
      actualOrganizationId = parent?.organizationId ?? undefined;
      actualBrandId = parent?.brandId ?? undefined;
    } else if (parentType === 'ARTICLE') {
      const parentArticleId = this.readString(record.parentArticleId);
      if (!parentArticleId) {
        throw artifactNotFound('Asset', recordId);
      }
      const parent = await this.prisma.article.findFirst({
        select: { brandId: true, organizationId: true },
        where: {
          id: parentArticleId,
          isDeleted: false,
          organizationId,
        },
      });
      actualOrganizationId = parent?.organizationId;
      actualBrandId = parent?.brandId ?? undefined;
    } else if (parentType === 'ORGANIZATION') {
      actualBrandId = undefined;
    } else {
      throw artifactNotFound('Asset', recordId);
    }

    if (actualOrganizationId !== organizationId) {
      throw artifactNotFound('Asset', recordId);
    }

    return {
      brandId: actualBrandId,
      material: this.pick(record, [
        'category',
        'cloudObjectKey',
        'displayName',
        'externalId',
        'kind',
        'localAssetId',
        'mimeType',
        'origin',
        'originalFileName',
        'parentArticleId',
        'parentBrandId',
        'parentIngredientId',
        'parentOrgId',
        'parentType',
        'residency',
        'sha256',
        'sizeBytes',
        'uploadPolicy',
      ]),
      record: {
        ...record,
        brandId: actualBrandId,
        organizationId: actualOrganizationId,
      },
      recordVersion: this.readString(record.sha256),
    };
  }

  private async loadScopedRecord(
    label: string,
    delegate: { findFirst(args: never): Promise<unknown> },
    recordId: string,
    organizationId: string,
    materialFields: readonly string[],
  ): Promise<CanonicalRecordState> {
    const result = await delegate.findFirst({
      where: { id: recordId, isDeleted: false, organizationId },
    } as never);
    if (!result) {
      throw artifactNotFound(label, recordId);
    }

    const record = result as CanonicalRecord;
    return {
      brandId: this.readString(record.brandId),
      material: this.pick(record, materialFields),
      record,
    };
  }

  private assertReferenceContract(
    reference: AgentArtifactReference,
    readContext: AgentArtifactReferenceReadContext,
  ): void {
    if (
      !reference.recordId.trim() ||
      reference.organizationId !== readContext.organizationId
    ) {
      throw new ForbiddenException(
        'Artifact reference is outside the authenticated organization.',
      );
    }

    if (
      reference.serializer !== AGENT_ARTIFACT_SERIALIZER_BY_KIND[reference.kind]
    ) {
      throw new ForbiddenException(
        'Artifact serializer does not match the canonical record kind.',
      );
    }

    if (readContext.brandId && reference.brandId !== readContext.brandId) {
      throw new ForbiddenException(
        'Artifact reference is outside the authenticated brand.',
      );
    }
  }

  private assertCanonicalScope(
    reference: AgentArtifactReference,
    canonicalBrandId?: string,
  ): void {
    if ((reference.brandId ?? undefined) !== canonicalBrandId) {
      throw new ForbiddenException(
        'Canonical record scope does not match the typed artifact reference.',
      );
    }
  }

  private async assertActorAuthorized(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const [member, organization] = await Promise.all([
      this.prisma.member.findFirst({
        select: { id: true },
        where: {
          isActive: true,
          isDeleted: false,
          organizationId,
          userId,
        },
      }),
      this.prisma.organization.findUnique({
        select: { userId: true },
        where: { id: organizationId, isDeleted: false },
      }),
    ]);
    if (!member && organization?.userId !== userId) {
      throw new ForbiddenException(
        'Version pin creator is not an active organization member.',
      );
    }
  }

  private buildReference(
    kind: AgentArtifactRecordKind,
    recordId: string,
    context: AgentArtifactReferenceReadContext,
  ): AgentArtifactReference {
    const serializer: AgentArtifactSerializer =
      AGENT_ARTIFACT_SERIALIZER_BY_KIND[kind];
    return {
      ...(context.brandId ? { brandId: context.brandId } : {}),
      kind,
      organizationId: context.organizationId,
      recordId,
      serializer,
    } as AgentArtifactReference;
  }

  private referenceFromPin(pin: ContentVersionPin): AgentArtifactReference {
    if (!this.isRecordKind(pin.recordKind)) {
      throw new ConflictException(
        'Content version pin uses an unsupported canonical record kind.',
      );
    }
    return this.buildReference(pin.recordKind, pin.recordId, {
      brandId: pin.brandId ?? undefined,
      organizationId: pin.organizationId,
    });
  }

  private toVersionPin(pin: ContentVersionPin): AgentArtifactVersionPin {
    if (!this.isRecordKind(pin.recordKind)) {
      throw new ConflictException(
        'Content version pin uses an unsupported canonical record kind.',
      );
    }
    return {
      ...(pin.brandId ? { brandId: pin.brandId } : {}),
      contentDigest: pin.contentDigest,
      createdAt: pin.createdAt.toISOString(),
      createdByUserId: pin.createdByUserId,
      id: pin.id,
      idempotencyKey: pin.idempotencyKey,
      kind: pin.recordKind,
      organizationId: pin.organizationId,
      provenance: this.readRecord(pin.provenance),
      recordId: pin.recordId,
      ...(pin.recordVersion ? { recordVersion: pin.recordVersion } : {}),
    };
  }

  private async findPinByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<ContentVersionPin | null> {
    return this.prisma.contentVersionPin.findFirst({
      where: { idempotencyKey, organizationId },
    });
  }

  private digestMaterial(material: CanonicalRecord): string {
    const canonicalJson = JSON.stringify(this.normalizeForDigest(material));
    return `${CONTENT_DIGEST_PREFIX}${createHash('sha256')
      .update(canonicalJson)
      .digest('hex')}`;
  }

  private buildIdempotencyKey(
    reference: AgentArtifactReference,
    contentDigest: string,
  ): string {
    const identity = [
      reference.organizationId,
      reference.brandId ?? '~',
      reference.kind,
      reference.recordId,
      contentDigest,
    ].join('\u001f');
    return `${IDEMPOTENCY_KEY_PREFIX}${createHash('sha256')
      .update(identity)
      .digest('hex')}`;
  }

  private normalizeForDigest(value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeForDigest(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as CanonicalRecord)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.normalizeForDigest(item)]),
      );
    }
    return value;
  }

  private normalizeForSerializer(
    kind: AgentArtifactRecordKind,
    record: CanonicalRecord,
  ): CanonicalRecord {
    if (kind !== 'article') {
      return record;
    }
    return {
      ...record,
      bannerUrl: record.coverImageUrl,
      label: record.title,
      summary: record.excerpt,
    };
  }

  private pick(
    record: CanonicalRecord,
    fields: readonly string[],
  ): CanonicalRecord {
    return Object.fromEntries(fields.map((field) => [field, record[field]]));
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readRecord(value: unknown): CanonicalRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as CanonicalRecord)
      : {};
  }

  private readTypedReferences(value: unknown): AgentArtifactReference[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((candidate): candidate is AgentArtifactReference => {
      if (!candidate || typeof candidate !== 'object') {
        return false;
      }
      const reference = candidate as Partial<AgentArtifactReference>;
      return (
        this.isRecordKind(reference.kind) &&
        typeof reference.recordId === 'string' &&
        typeof reference.organizationId === 'string' &&
        reference.serializer ===
          AGENT_ARTIFACT_SERIALIZER_BY_KIND[reference.kind]
      );
    });
  }

  private extractLegacyReferenceCandidates(
    metadata: unknown,
  ): LegacyReferenceCandidate[] {
    const record = this.readRecord(metadata);
    const actions = Array.isArray(record.uiActions) ? record.uiActions : [];
    const candidates: LegacyReferenceCandidate[] = [];

    for (const rawAction of actions) {
      const action = this.readRecord(rawAction);
      const contentId = this.readString(action.contentId);
      if (contentId) {
        candidates.push({
          kind: 'ingredient',
          recordId: contentId,
          source: 'ui-action-content-id',
        });
      }

      const ingredients = Array.isArray(action.ingredients)
        ? action.ingredients
        : [];
      for (const rawIngredient of ingredients) {
        const ingredient = this.readRecord(rawIngredient);
        const ingredientId = this.readString(ingredient.id);
        if (ingredientId) {
          candidates.push({
            kind: 'ingredient',
            recordId: ingredientId,
            source: 'ui-action-ingredient-id',
          });
        }
      }

      if (candidates.length >= MAX_LEGACY_REFERENCE_CANDIDATES) {
        break;
      }
    }

    const unique = new Map<string, LegacyReferenceCandidate>();
    for (const candidate of candidates.slice(
      0,
      MAX_LEGACY_REFERENCE_CANDIDATES,
    )) {
      unique.set(`${candidate.kind}:${candidate.recordId}`, candidate);
    }
    return [...unique.values()];
  }

  private dedupeReferences(
    references: AgentArtifactReference[],
  ): AgentArtifactReference[] {
    const unique = new Map<string, AgentArtifactReference>();
    for (const reference of references) {
      unique.set(`${reference.kind}:${reference.recordId}`, reference);
    }
    return [...unique.values()];
  }

  private isRecordKind(value: unknown): value is AgentArtifactRecordKind {
    return (
      value === 'article' ||
      value === 'asset' ||
      value === 'content-draft' ||
      value === 'ingredient' ||
      value === 'newsletter' ||
      value === 'post'
    );
  }

  private recordReferenceTelemetry(
    resolution: 'canonical' | 'legacy-message' | 'none',
    params: ResolveMessageArtifactReferencesParams,
    extra: Record<string, unknown> = {},
  ): void {
    this.logger?.log('agent_artifact_reference_read', {
      brandId: params.readContext.brandId,
      client: params.telemetry?.client ?? 'unknown',
      deployment: params.telemetry?.deployment ?? 'unknown',
      isInternal: params.telemetry?.isInternal ?? false,
      isKnownBot: params.telemetry?.isKnownBot ?? false,
      messageId: params.messageId,
      organizationId: params.readContext.organizationId,
      resolution,
      telemetryQueryVersion: 1,
      ...extra,
    });
  }
}

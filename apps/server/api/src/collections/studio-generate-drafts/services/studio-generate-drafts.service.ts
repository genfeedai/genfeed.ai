import {
  STUDIO_GENERATE_DRAFT_TYPES,
  STUDIO_GENERATE_REFERENCE_ROLES,
  type UpsertStudioGenerateDraftDto,
} from '@api/collections/studio-generate-drafts/dto/upsert-studio-generate-draft.dto';
import type { StudioGenerateDraftDocument } from '@api/collections/studio-generate-drafts/schemas/studio-generate-draft.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IStudioGenerateDraft,
  KnowledgeSelection,
  StudioGenerateDraftPayload,
  StudioGenerateDraftReference,
  StudioGenerateType,
} from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface StudioGenerateDraftRequestScope {
  brandId: string;
  organizationId: string;
  userId: string;
}

const REFERENCE_ROLES = new Set<string>(STUDIO_GENERATE_REFERENCE_ROLES);
const DRAFT_TYPES = new Set<string>(STUDIO_GENERATE_DRAFT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readReferences(value: unknown): StudioGenerateDraftReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is StudioGenerateDraftReference =>
      isRecord(entry) &&
      typeof entry.id === 'string' &&
      entry.id.length > 0 &&
      typeof entry.role === 'string' &&
      REFERENCE_ROLES.has(entry.role),
  );
}

/** Keeps only per-type objects for asset types the composer knows. */
function readSettingsByType(
  value: unknown,
): StudioGenerateDraftPayload['settingsByType'] {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([type, settings]) => DRAFT_TYPES.has(type) && isRecord(settings),
    ),
  );
}

function readType(value: unknown): StudioGenerateType {
  return typeof value === 'string' && DRAFT_TYPES.has(value)
    ? (value as StudioGenerateType)
    : 'image';
}

function dedupeReferences(
  references: readonly StudioGenerateDraftReference[],
): StudioGenerateDraftReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (seen.has(reference.id)) {
      return false;
    }
    seen.add(reference.id);
    return true;
  });
}

/**
 * The Generate composer draft: one row per organization, brand and user.
 * Every read and write re-checks referenced ingredients against the draft's
 * organization and brand, so a deleted or foreign asset never comes back.
 */
@Injectable()
export class StudioGenerateDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async findCurrent(
    scope: StudioGenerateDraftRequestScope,
  ): Promise<IStudioGenerateDraft | null> {
    const draft = await this.prisma.studioGenerateDraft.findFirst({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        userId: scope.userId,
      }),
    });
    if (!draft) {
      return null;
    }

    const candidateIds = [
      ...readReferences(draft.references),
      ...readReferences(draft.attachments),
    ].map((reference) => reference.id);
    const allowedIds = await this.findAllowedIngredientIds(candidateIds, scope);

    return this.toScopedDraft(draft, allowedIds, candidateIds);
  }

  async upsertCurrent(
    dto: UpsertStudioGenerateDraftDto,
    scope: StudioGenerateDraftRequestScope,
  ): Promise<IStudioGenerateDraft> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: scopedWhere(scope.organizationId, { id: scope.brandId }),
    });
    if (!brand) {
      throw new NotFoundException('Brand', scope.brandId);
    }

    const references = dedupeReferences(dto.references);
    const attachments = dedupeReferences(dto.attachments);
    const allowedIds = await this.findAllowedIngredientIds(
      [...references, ...attachments].map((reference) => reference.id),
      scope,
    );
    const knowledgeSelection: KnowledgeSelection = {
      ...(dto.knowledgeSelection.sourceIds
        ? { sourceIds: dto.knowledgeSelection.sourceIds }
        : {}),
      ...(dto.knowledgeSelection.spaceIds
        ? { spaceIds: dto.knowledgeSelection.spaceIds }
        : {}),
      ...(dto.knowledgeSelection.purposes
        ? { purposes: dto.knowledgeSelection.purposes }
        : {}),
    };
    const data = {
      attachments: toPrismaJson(
        attachments.filter((attachment) => allowedIds.has(attachment.id)),
      ),
      knowledgeSelection: toPrismaJson(knowledgeSelection),
      prompt: dto.prompt,
      references: toPrismaJson(
        references.filter((reference) => allowedIds.has(reference.id)),
      ),
      settingsByType: toPrismaJson(readSettingsByType(dto.settingsByType)),
      type: dto.type,
    };

    const draft = await this.prisma.studioGenerateDraft.upsert({
      create: {
        ...data,
        brandId: scope.brandId,
        organizationId: scope.organizationId,
        userId: scope.userId,
      },
      update: { ...data, isDeleted: false },
      where: {
        organizationId_brandId_userId: {
          brandId: scope.brandId,
          organizationId: scope.organizationId,
          userId: scope.userId,
        },
      },
    });

    return this.toScopedDraft(
      draft,
      allowedIds,
      [...references, ...attachments].map((reference) => reference.id),
    );
  }

  private async findAllowedIngredientIds(
    ids: readonly string[],
    scope: StudioGenerateDraftRequestScope,
  ): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }

    const ingredients = await this.prisma.ingredient.findMany({
      select: { id: true },
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        id: { in: [...new Set(ids)] },
      }),
    });

    return new Set(ingredients.map((ingredient) => ingredient.id));
  }

  /**
   * Projects a stored row onto the contract. Every candidate id outside
   * `allowedIds` — deleted, or owned by another organization or brand — is
   * dropped from the draft and reported so the composer can say so.
   */
  private toScopedDraft(
    draft: StudioGenerateDraftDocument,
    allowedIds: ReadonlySet<string>,
    candidateIds: readonly string[],
  ): IStudioGenerateDraft {
    const references = readReferences(draft.references);
    const attachments = readReferences(draft.attachments);
    const droppedReferenceIds = [...new Set(candidateIds)].filter(
      (id) => !allowedIds.has(id),
    );
    if (droppedReferenceIds.length > 0) {
      this.logger.warn('Dropped unavailable Studio draft references', {
        brandId: draft.brandId,
        droppedReferenceIds,
        organizationId: draft.organizationId,
      });
    }

    return {
      attachments: attachments.filter((attachment) =>
        allowedIds.has(attachment.id),
      ),
      brandId: draft.brandId,
      createdAt: draft.createdAt.toISOString(),
      droppedReferenceIds,
      id: draft.id,
      isDeleted: draft.isDeleted,
      knowledgeSelection: isRecord(draft.knowledgeSelection)
        ? (draft.knowledgeSelection as KnowledgeSelection)
        : {},
      organizationId: draft.organizationId,
      prompt: draft.prompt,
      references: references.filter((reference) =>
        allowedIds.has(reference.id),
      ),
      settingsByType: readSettingsByType(draft.settingsByType),
      type: readType(draft.type),
      updatedAt: draft.updatedAt.toISOString(),
      userId: draft.userId,
    };
  }
}

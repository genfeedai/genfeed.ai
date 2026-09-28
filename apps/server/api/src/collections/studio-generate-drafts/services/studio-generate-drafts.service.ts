import { isPrismaUniqueConstraintError } from '@api/collections/shared/slug-allocation.util';
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
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface StudioGenerateDraftRequestScope {
  brandId: string;
  organizationId: string;
  userId: string;
}

type StudioGenerateDraftWriteData = Pick<
  Prisma.StudioGenerateDraftUncheckedCreateInput,
  | 'attachments'
  | 'knowledgeSelection'
  | 'prompt'
  | 'references'
  | 'settingsByType'
  | 'type'
>;

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

const SETTING_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const MAX_SETTINGS_PER_TYPE = 40;
const MAX_SETTING_TEXT_LENGTH = 5_000;
const MAX_SETTING_LIST_LENGTH = 100;
/** Upper bound on the stored settings JSON, well above a real composer. */
export const STUDIO_GENERATE_DRAFT_MAX_SETTINGS_BYTES = 32_768;

function isSettingValue(value: unknown): boolean {
  if (value === null || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'string') {
    return value.length <= MAX_SETTING_TEXT_LENGTH;
  }
  return (
    Array.isArray(value) &&
    value.length <= MAX_SETTING_LIST_LENGTH &&
    value.every(
      (entry) =>
        typeof entry === 'string' && entry.length <= MAX_SETTING_TEXT_LENGTH,
    )
  );
}

/**
 * Keeps known asset types, and inside each only flat composer fields: short
 * scalar values or string lists. Anything else is dropped, so the column can
 * only ever hold what the composer itself would write.
 */
function readSettingsByType(
  value: unknown,
): StudioGenerateDraftPayload['settingsByType'] {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([type, settings]) => {
      if (!DRAFT_TYPES.has(type) || !isRecord(settings)) {
        return [];
      }
      const fields = Object.entries(settings)
        .filter(
          ([key, fieldValue]) =>
            SETTING_KEY_PATTERN.test(key) && isSettingValue(fieldValue),
        )
        .slice(0, MAX_SETTINGS_PER_TYPE);
      return [[type, Object.fromEntries(fields)]];
    }),
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
    await this.assertBrandInOrganization(scope);
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
    const settingsByType = readSettingsByType(dto.settingsByType);
    if (
      JSON.stringify(settingsByType).length >
      STUDIO_GENERATE_DRAFT_MAX_SETTINGS_BYTES
    ) {
      throw new BadRequestException('Composer settings are too large');
    }
    await this.assertBrandInOrganization(scope);

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
    const data: StudioGenerateDraftWriteData = {
      attachments: toPrismaJson(
        attachments.filter((attachment) => allowedIds.has(attachment.id)),
      ),
      knowledgeSelection: toPrismaJson(knowledgeSelection),
      prompt: dto.prompt,
      references: toPrismaJson(
        references.filter((reference) => allowedIds.has(reference.id)),
      ),
      settingsByType: toPrismaJson(settingsByType),
      type: dto.type,
    };

    const draft = await this.writeDraft(scope, data);

    return this.toScopedDraft(
      draft,
      allowedIds,
      [...references, ...attachments].map((reference) => reference.id),
    );
  }

  /**
   * One row per organization, brand and user. Every write is a tenant-scoped
   * update first; only the very first save creates the row, and a concurrent
   * first save that loses the unique-key race lands as an update instead.
   */
  private async writeDraft(
    scope: StudioGenerateDraftRequestScope,
    data: StudioGenerateDraftWriteData,
  ): Promise<StudioGenerateDraftDocument> {
    const { count } = await this.prisma.studioGenerateDraft.updateMany({
      data,
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        userId: scope.userId,
      }),
    });
    if (count === 0) {
      try {
        await this.prisma.studioGenerateDraft.create({
          data: {
            ...data,
            brandId: scope.brandId,
            organizationId: scope.organizationId,
            userId: scope.userId,
          },
        });
      } catch (error) {
        if (!isPrismaUniqueConstraintError(error)) {
          throw error;
        }
        await this.prisma.studioGenerateDraft.updateMany({
          data,
          where: scopedWhere(scope.organizationId, {
            brandId: scope.brandId,
            userId: scope.userId,
          }),
        });
      }
    }

    const draft = await this.prisma.studioGenerateDraft.findFirst({
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        userId: scope.userId,
      }),
    });
    if (!draft) {
      throw new NotFoundException('Studio generate draft', scope.brandId);
    }
    return draft;
  }

  private async assertBrandInOrganization(
    scope: StudioGenerateDraftRequestScope,
  ): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: scopedWhere(scope.organizationId, { id: scope.brandId }),
    });
    if (!brand) {
      throw new NotFoundException('Brand', scope.brandId);
    }
  }

  private async findAllowedIngredientIds(
    ids: readonly string[],
    scope: StudioGenerateDraftRequestScope,
  ): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }

    const uniqueIds = [...new Set(ids)];
    // Bounded by the DTO: at most the references plus attachments of one draft.
    const ingredients = await this.prisma.ingredient.findMany({
      select: { id: true },
      take: uniqueIds.length,
      where: scopedWhere(scope.organizationId, {
        brandId: scope.brandId,
        id: { in: uniqueIds },
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

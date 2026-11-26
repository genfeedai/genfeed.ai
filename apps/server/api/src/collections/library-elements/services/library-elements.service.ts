import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreateLibraryElementDto } from '@api/collections/library-elements/dto/create-library-element.dto';
import type { LibraryElementsQueryDto } from '@api/collections/library-elements/dto/library-elements-query.dto';
import type { UpdateLibraryElementDto } from '@api/collections/library-elements/dto/update-library-element.dto';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import {
  brandAvailabilityWhere,
  hasSharedAvailability,
  isPersonaAvailableToBrand,
} from '@api/collections/personas/utils/persona-availability.util';
import { rethrowHandleConflict } from '@api/collections/personas/utils/persona-handle-conflict.util';
import { assertOwningBrandLive } from '@api/collections/personas/utils/persona-handle-lock.util';
import {
  findCharacterReferenceImageIds,
  orderedReferenceIdsFromRow,
  PERSONA_REFERENCES_SELECT,
} from '@api/collections/personas/utils/persona-references.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  isPersonaHandle,
  type LibraryElementKind,
  normalizePersonaHandle,
  PersonaAvailabilityMode,
} from '@genfeedai/contracts';
import type { PersonaAvailabilityFields } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** What a caller needs to read the elements of one brand. */
export interface LibraryElementReadScope {
  brandId: string;
  organizationId: string;
}

export interface LibraryElementActor extends LibraryElementReadScope {
  apiKeyContext?: Pick<AuthenticatedUser, 'isApiKey' | 'scopes'>;
  isSuperAdmin?: boolean;
  userId: string;
}

/** One row of the merged References list, characters and elements alike. */
export interface LibraryElementRow {
  availabilityMode: PersonaAvailabilityMode;
  availableBrandIds: string[];
  brandId: string | null;
  coverIngredientId: string | null;
  createdAt: Date;
  description: string | null;
  handle: string | null;
  id: string;
  isShared: boolean;
  kind: LibraryElementKind;
  label: string;
  organizationId: string;
  owningBrandId: string | null;
  owningBrandName: string | null;
  referenceIngredientIds: string[];
  type: LibraryElementKind;
  updatedAt: Date;
}

export interface LibraryElementPage {
  docs: LibraryElementRow[];
  limit: number;
  page: number;
  totalDocs: number;
  totalPages: number;
}

const LEADING_AT = /^@/;

const ELEMENT_INCLUDE = {
  brand: { select: { label: true } },
  references: PERSONA_REFERENCES_SELECT,
} as const;

type ElementWithRelations = Awaited<
  ReturnType<LibraryElementsService['loadElements']>
>[number];

/**
 * Reusable locations, styles and props (#7374). They share the character
 * handle namespace, availability model and reference-file rules, so a brand
 * mentions one with the same `@handle` as a character.
 */
@Traced()
@Injectable()
export class LibraryElementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personas: PersonasService,
  ) {}

  /** Characters and elements the brand can use, newest edit first. */
  async list(
    scope: LibraryElementReadScope,
    query: Pick<LibraryElementsQueryDto, 'kind' | 'limit' | 'page' | 'q'>,
  ): Promise<LibraryElementPage> {
    const { limit, page } = query;
    const kinds = query.kind?.length ? query.kind : undefined;
    const includeCharacters = !kinds || kinds.includes('CHARACTER');
    const elementTypes = kinds?.filter(
      (kind): kind is Exclude<LibraryElementKind, 'CHARACTER'> =>
        kind !== 'CHARACTER',
    );
    const includeElements = !kinds || (elementTypes?.length ?? 0) > 0;
    const search = query.q?.trim().replace(LEADING_AT, '');
    const textFilter = search
      ? {
          OR: [
            { label: { contains: search, mode: 'insensitive' as const } },
            { handle: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const reach = brandAvailabilityWhere(scope.brandId);
    const fetchCount = page * limit;

    const [characters, characterCount, elements, elementCount] =
      await Promise.all([
        includeCharacters
          ? this.prisma.persona.findMany({
              include: ELEMENT_INCLUDE,
              orderBy: { updatedAt: 'desc' },
              take: fetchCount,
              where: scopedWhere(scope.organizationId, {
                AND: [reach, textFilter],
              }),
            })
          : [],
        includeCharacters
          ? this.prisma.persona.count({
              where: scopedWhere(scope.organizationId, {
                AND: [reach, textFilter],
              }),
            })
          : 0,
        includeElements
          ? this.loadElements(scope.organizationId, fetchCount, {
              AND: [
                reach,
                textFilter,
                ...(elementTypes ? [{ type: { in: elementTypes } }] : []),
              ],
            })
          : [],
        includeElements
          ? this.prisma.libraryElement.count({
              where: scopedWhere(scope.organizationId, {
                AND: [
                  reach,
                  textFilter,
                  ...(elementTypes ? [{ type: { in: elementTypes } }] : []),
                ],
              }),
            })
          : 0,
      ]);

    const rows = [
      ...characters.map((row) => this.characterRow(row)),
      ...elements.map((row) => this.elementRow(row)),
    ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const totalDocs = characterCount + elementCount;
    return {
      docs: rows.slice((page - 1) * limit, page * limit),
      limit,
      page,
      totalDocs,
      totalPages: Math.max(1, Math.ceil(totalDocs / limit)),
    };
  }

  /** An element the brand can use; a hidden or foreign one is not found. */
  async findOne(
    scope: LibraryElementReadScope,
    id: string,
  ): Promise<LibraryElementRow> {
    const row = await this.findAvailable(scope, id);
    return this.elementRow(row);
  }

  async create(
    actor: LibraryElementActor,
    dto: CreateLibraryElementDto,
  ): Promise<LibraryElementRow> {
    const handle = this.requireHandle(dto.handle);
    const description = dto.description?.trim() || null;
    const referenceIds = dto.referenceIngredientIds ?? [];
    await this.assertReferenceImages(actor, actor.brandId, referenceIds);
    const availability = await this.resolveAvailability(
      actor,
      dto.availability,
    );
    if (
      availability.availabilityMode !== PersonaAvailabilityMode.OWNING_BRAND
    ) {
      await this.personas.assertCanManageSharing(actor);
    }

    try {
      const created = await this.personas.withHandleLock(
        actor.organizationId,
        async (tx) => {
          await assertOwningBrandLive(tx, actor.brandId, actor.organizationId);
          await this.personas.assertNoHandleCollision({
            availability,
            client: tx,
            handle,
            organizationId: actor.organizationId,
            owningBrandId: actor.brandId,
          });
          return tx.libraryElement.create({
            data: {
              ...availability,
              brandId: actor.brandId,
              description,
              handle,
              label: dto.label.trim(),
              organizationId: actor.organizationId,
              references: {
                create: referenceIds.map((ingredientId, position) => ({
                  ingredientId,
                  organizationId: actor.organizationId,
                  position,
                })),
              },
              type: dto.type,
              userId: actor.userId,
            },
            select: { id: true },
          });
        },
      );
      return this.findOne(actor, created.id);
    } catch (error: unknown) {
      rethrowHandleConflict(error, handle);
    }
  }

  async update(
    actor: LibraryElementActor,
    id: string,
    dto: UpdateLibraryElementDto,
  ): Promise<LibraryElementRow> {
    const existing = await this.findAvailable(actor, id);
    await this.assertCanModify(actor, existing);
    const owningBrandId = existing.brandId;
    if (!owningBrandId) {
      throw new NotFoundException('LibraryElement', id);
    }

    const handle =
      dto.handle === undefined ? undefined : this.requireHandle(dto.handle);
    const availability = dto.availability
      ? await this.resolveAvailability(
          { ...actor, brandId: owningBrandId },
          dto.availability,
        )
      : undefined;
    if (
      availability &&
      availability.availabilityMode !== PersonaAvailabilityMode.OWNING_BRAND
    ) {
      await this.personas.assertCanManageSharing(actor);
    }
    const referenceIds = dto.referenceIngredientIds;
    if (referenceIds) {
      await this.assertReferenceImages(actor, owningBrandId, referenceIds);
    }

    try {
      await this.personas.withHandleLock(actor.organizationId, async (tx) => {
        await assertOwningBrandLive(tx, owningBrandId, actor.organizationId);
        if (handle !== undefined || availability) {
          await this.personas.assertNoHandleCollision({
            availability: availability ?? existing,
            client: tx,
            excludeElementId: id,
            handle: handle ?? existing.handle,
            organizationId: actor.organizationId,
            owningBrandId,
          });
        }
        const updated = await tx.libraryElement.updateMany({
          data: {
            ...availability,
            ...(dto.description !== undefined
              ? { description: dto.description.trim() || null }
              : {}),
            ...(handle !== undefined ? { handle } : {}),
            ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          },
          where: scopedWhere(actor.organizationId, { id }),
        });
        if (updated.count === 0) {
          throw new NotFoundException('LibraryElement', id);
        }
        if (referenceIds) {
          await tx.libraryElementReference.deleteMany({
            where: { elementId: id, organizationId: actor.organizationId },
          });
          await tx.libraryElementReference.createMany({
            data: referenceIds.map((ingredientId, position) => ({
              elementId: id,
              ingredientId,
              organizationId: actor.organizationId,
              position,
            })),
          });
        }
      });
      return this.findOne(actor, id);
    } catch (error: unknown) {
      rethrowHandleConflict(error, handle);
    }
  }

  /** Soft delete. The reference files stay in the Library. */
  async remove(actor: LibraryElementActor, id: string): Promise<void> {
    const existing = await this.findAvailable(actor, id);
    await this.assertCanModify(actor, existing);
    const removed = await this.prisma.libraryElement.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(actor.organizationId, { id }),
    });
    if (removed.count === 0) {
      throw new NotFoundException('LibraryElement', id);
    }
  }

  private loadElements(
    organizationId: string,
    fetchCount: number,
    where: Record<string, unknown>,
  ) {
    return this.prisma.libraryElement.findMany({
      include: ELEMENT_INCLUDE,
      orderBy: { updatedAt: 'desc' },
      take: fetchCount,
      where: scopedWhere(organizationId, where),
    });
  }

  private async findAvailable(
    scope: LibraryElementReadScope,
    id: string,
  ): Promise<ElementWithRelations> {
    const row = await this.prisma.libraryElement.findFirst({
      include: ELEMENT_INCLUDE,
      where: scopedWhere(scope.organizationId, { id }),
    });
    if (!row || !isPersonaAvailableToBrand(row, scope.brandId)) {
      throw new NotFoundException('LibraryElement', id);
    }
    return row;
  }

  /** A shared element is edited by owners and admins; others by its brand. */
  private async assertCanModify(
    actor: LibraryElementActor,
    element: Pick<
      PersonaAvailabilityFields,
      'availabilityMode' | 'availableBrandIds' | 'brandId'
    >,
  ): Promise<void> {
    if (hasSharedAvailability(element)) {
      await this.personas.assertCanManageSharing(actor);
    }
    if (element.brandId !== actor.brandId && !actor.isSuperAdmin) {
      await this.personas.assertCanManageSharing(actor);
    }
  }

  private async resolveAvailability(
    actor: LibraryElementReadScope,
    availability: CreateLibraryElementDto['availability'],
  ) {
    return this.personas.resolveAvailability({
      brandIds: availability?.brandIds,
      mode: availability?.mode ?? PersonaAvailabilityMode.OWNING_BRAND,
      organizationId: actor.organizationId,
      owningBrandId: actor.brandId,
    });
  }

  private async assertReferenceImages(
    scope: LibraryElementReadScope,
    brandId: string,
    ingredientIds: readonly string[],
  ): Promise<void> {
    const found = new Set(
      await findCharacterReferenceImageIds(this.prisma, {
        brandId,
        ingredientIds,
        organizationId: scope.organizationId,
      }),
    );
    const missing = ingredientIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ValidationException(
        'Choose completed images from this brand',
        'referenceIngredientIds',
        missing,
      );
    }
  }

  private requireHandle(raw: string): string {
    const handle = normalizePersonaHandle(raw);
    if (handle === null || !isPersonaHandle(handle)) {
      throw new ValidationException(
        'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
        'handle',
        raw,
      );
    }
    return handle;
  }

  private elementRow(row: ElementWithRelations): LibraryElementRow {
    const referenceIngredientIds = orderedReferenceIdsFromRow({
      avatarIngredientId: null,
      references: row.references,
    });
    return {
      availabilityMode: PersonaAvailabilityMode[row.availabilityMode],
      availableBrandIds: row.availableBrandIds,
      brandId: row.brandId,
      coverIngredientId: referenceIngredientIds[0] ?? null,
      createdAt: row.createdAt,
      description: row.description,
      handle: row.handle,
      id: row.id,
      isShared: hasSharedAvailability(row),
      kind: row.type,
      label: row.label,
      organizationId: row.organizationId,
      owningBrandId: row.brandId,
      owningBrandName: row.brand?.label ?? null,
      referenceIngredientIds,
      type: row.type,
      updatedAt: row.updatedAt,
    };
  }

  private characterRow(
    row: Awaited<ReturnType<PrismaService['persona']['findMany']>>[number] & {
      brand?: { label: string } | null;
      references?: Array<{
        ingredient?: { isDeleted: boolean } | null;
        ingredientId: string;
        position: number;
      }>;
    },
  ): LibraryElementRow {
    const referenceIngredientIds = orderedReferenceIdsFromRow(row);
    return {
      availabilityMode: PersonaAvailabilityMode[row.availabilityMode],
      availableBrandIds: row.availableBrandIds,
      brandId: row.brandId,
      coverIngredientId: referenceIngredientIds[0] ?? null,
      createdAt: row.createdAt,
      description: row.description,
      handle: row.handle,
      id: row.id,
      isShared: hasSharedAvailability(row),
      kind: 'CHARACTER',
      label: row.label,
      organizationId: row.organizationId,
      owningBrandId: row.brandId,
      owningBrandName: row.brand?.label ?? null,
      referenceIngredientIds,
      type: 'CHARACTER',
      updatedAt: row.updatedAt,
    };
  }
}

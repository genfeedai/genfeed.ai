import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonaGrantReadService } from '@api/collections/personas/services/persona-grant-read.service';
import {
  type CharacterAdmission,
  type CharacterAdmissionPath,
  evaluateCharacterAdmission,
  noCharacterAdmission,
} from '@api/collections/personas/utils/character-admission.util';
import {
  brandAvailabilityWhere,
  isPersonaAvailableToBrand,
  isPersonaSharedAcrossBrands,
  resolvePersonaBrandIds,
} from '@api/collections/personas/utils/persona-availability.util';
import { lockPersonaHandleScope } from '@api/collections/personas/utils/persona-handle-lock.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PrismaUpdate } from '@api/shared/services/base/base-query-normalization.adapter';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  IngredientCategory,
  IngredientStatus,
  isPersonaHandle,
  MemberRole,
  normalizePersonaHandle,
  PersonaAvailabilityMode,
  PersonaStatus,
} from '@genfeedai/contracts';
import type {
  AgentCharacterMentionItem,
  CharacterAvailability,
  CharacterAvailabilityInput,
  CharacterHandleResolution,
  PersonaAvailabilityFields,
  PopulateOption,
} from '@genfeedai/contracts/interfaces';
import { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException, Injectable } from '@nestjs/common';

type ApiKeyRoleContext = Pick<AuthenticatedUser, 'isApiKey' | 'scopes'>;
export type PersonaClient = Pick<
  PrismaService,
  | '$queryRaw'
  | 'brand'
  | 'persona'
  | 'personaAvailabilityAudit'
  | 'personaGrant'
  | 'personaGrantAudit'
>;

function isPersonaHandleUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as {
    code?: unknown;
    meta?: { target?: unknown; constraint?: unknown };
  };
  if (record.code !== 'P2002') {
    return false;
  }
  const target = record.meta?.target;
  const constraint = record.meta?.constraint;
  const haystack = [
    ...(Array.isArray(target) ? target.map(String) : [String(target ?? '')]),
    String(constraint ?? ''),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes('handle') || haystack.includes('org_brand_handle');
}

function rethrowHandleConflict(error: unknown, handle?: string | null): never {
  if (isPersonaHandleUniqueViolation(error)) {
    throw new ValidationException(
      'A character with this handle already exists in this brand',
      'handle',
      handle,
    );
  }
  throw error;
}

@Injectable()
export class PersonasService extends BaseService<
  PersonaDocument,
  CreatePersonaDto,
  UpdatePersonaDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly grants: PersonaGrantReadService,
  ) {
    super(prisma, 'persona', logger);
  }

  protected normalizeDocument(document: unknown): PersonaDocument {
    const record = document as Record<string, unknown>;
    const config =
      typeof record.config === 'object' && record.config !== null
        ? (record.config as Record<string, unknown>)
        : {};
    return { ...config, ...record } as PersonaDocument;
  }

  async create(
    dto: CreatePersonaDto & {
      userId: string;
      organizationId: string;
      brandId?: string | null;
      availabilityMode?: PersonaAvailabilityMode;
      availableBrandIds?: string[];
      bio?: string;
      emoji?: string;
      eyeColor?: string;
      fleetSources?: Array<Record<string, unknown>>;
      loraStatus?: string;
      niche?: string;
      s3Folder?: string;
      skinTone?: string;
      triggerWord?: string;
    },
    populate: PopulateOption[] = [
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PersonaDocument> {
    const {
      bio,
      contentStrategy,
      emoji,
      eyeColor,
      fleetSources,
      loraStatus,
      niche,
      s3Folder,
      skinTone,
      triggerWord,
      ...rest
    } = dto;
    const handle = normalizePersonaHandle(rest.handle);
    if (handle !== null && !isPersonaHandle(handle)) {
      throw new ValidationException(
        'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
        'handle',
        handle,
      );
    }
    const config = {
      ...(bio !== undefined ? { bio } : {}),
      ...(contentStrategy !== undefined ? { contentStrategy } : {}),
      ...(emoji !== undefined ? { emoji } : {}),
      ...(eyeColor !== undefined ? { eyeColor } : {}),
      ...(fleetSources !== undefined ? { fleetSources } : {}),
      ...(loraStatus !== undefined ? { loraStatus } : {}),
      ...(niche !== undefined ? { niche } : {}),
      ...(s3Folder !== undefined ? { s3Folder } : {}),
      ...(skinTone !== undefined ? { skinTone } : {}),
      ...(triggerWord !== undefined ? { triggerWord } : {}),
    };
    const payload = {
      ...rest,
      handle,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    };
    try {
      const owningBrandId = payload.brandId ?? null;
      if (handle === null || !owningBrandId || !payload.organizationId) {
        return await super.create(
          payload as unknown as CreatePersonaDto,
          populate,
        );
      }
      return await this.withHandleLock(payload.organizationId, async (tx) => {
        await this.assertNoHandleCollision({
          availability: {
            availabilityMode:
              payload.availabilityMode ?? PersonaAvailabilityMode.OWNING_BRAND,
            availableBrandIds: payload.availableBrandIds ?? [],
          },
          client: tx,
          handle,
          organizationId: payload.organizationId,
          owningBrandId,
        });
        return super.create(payload as unknown as CreatePersonaDto, populate);
      });
    } catch (error: unknown) {
      rethrowHandleConflict(error, handle);
    }
  }

  async patch(
    id: string,
    updateDto: Partial<UpdatePersonaDto> | PrismaUpdate,
    populate: PopulateOption[] = [
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PersonaDocument> {
    const nextDto = { ...updateDto };
    let normalizedHandle: string | null | undefined;
    if (Object.hasOwn(nextDto, 'handle')) {
      const rawHandle = nextDto.handle;
      if (
        typeof rawHandle !== 'string' &&
        rawHandle !== null &&
        rawHandle !== undefined
      ) {
        throw new ValidationException(
          'Handle must be a string',
          'handle',
          rawHandle,
        );
      }
      normalizedHandle = normalizePersonaHandle(rawHandle);
      if (normalizedHandle !== null && !isPersonaHandle(normalizedHandle)) {
        throw new ValidationException(
          'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
          'handle',
          normalizedHandle,
        );
      }
      nextDto.handle = normalizedHandle;
    }
    try {
      if (!normalizedHandle) {
        return await super.patch(id, nextDto, populate);
      }
      // The controller stamps the caller's organization on the update; a
      // handle change without it cannot be collision-checked.
      const organizationId = (nextDto as { organizationId?: unknown })
        .organizationId;
      if (typeof organizationId !== 'string' || !organizationId) {
        throw new ValidationException(
          'Organization is required to change a handle',
          'organizationId',
        );
      }
      const current = await this.prisma.persona.findFirst({
        select: {
          availabilityMode: true,
          availableBrandIds: true,
          brandId: true,
          organizationId: true,
        },
        where: scopedWhere(organizationId, { id }),
      });
      if (!current) {
        throw new NotFoundException('Persona', id);
      }
      if (!current.brandId) {
        return await super.patch(id, nextDto, populate);
      }
      const owningBrandId = current.brandId;
      return await this.withHandleLock(current.organizationId, async (tx) => {
        await this.assertNoHandleCollision({
          availability: current,
          client: tx,
          excludePersonaId: id,
          handle: normalizedHandle,
          organizationId: current.organizationId,
          owningBrandId,
        });
        return super.patch(id, nextDto, populate);
      });
    } catch (error: unknown) {
      rethrowHandleConflict(error, normalizedHandle);
    }
  }

  findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PersonaDocument | null> {
    return super.findOne(params, populate);
  }

  async findAll(
    input: unknown,
    options: AggregationOptions,
    enableCache?: boolean,
  ): Promise<AggregatePaginateResult<PersonaDocument>> {
    const result = await super.findAll(input, options, enableCache);
    const organizationId = (
      input as { where?: { organizationId?: unknown } } | null
    )?.where?.organizationId;
    if (typeof organizationId !== 'string') {
      return result;
    }
    const docs =
      result.docs.length > 0
        ? await this.withAvailabilitySummary(result.docs, organizationId)
        : result.docs;
    // Characters granted to this organization (#6037) ride on the first page.
    const grantedToBrandId = (input as { grantedToBrandId?: unknown } | null)
      ?.grantedToBrandId;
    const isFirstPage = !options.page || options.page === 1;
    if (typeof grantedToBrandId !== 'string' || !isFirstPage) {
      return { ...result, docs };
    }
    const granted = await this.grants.listForBrand({
      brandId: grantedToBrandId,
      organizationId,
    });
    return {
      ...result,
      docs: [
        ...docs,
        ...granted.map((grant) => ({
          ...this.normalizeDocument(grant.persona),
          availabilityMode: grant.availabilityMode,
          availableBrandCount: grant.availableBrandIds?.length ?? 0,
          availableBrandIds: grant.availableBrandIds ?? [],
          grantedByOrganizationName: grant.ownerOrganization.label,
          isGranted: true,
          isShared: false,
          owningBrandId: null,
          owningBrandName: null,
        })),
      ],
    };
  }

  async listCharacterMentions(params: {
    organizationId: string;
    brandId?: string | null;
    q?: string;
  }): Promise<AgentCharacterMentionItem[]> {
    const prefix = params.q?.trim();
    const rows = await this.prisma.persona.findMany({
      orderBy: { label: 'asc' },
      select: {
        availabilityMode: true,
        availableBrandIds: true,
        avatarIngredientId: true,
        brand: { select: { label: true } },
        brandId: true,
        handle: true,
        id: true,
        label: true,
      },
      take: 20,
      where: scopedWhere(params.organizationId, {
        handle: { not: null },
        status: PersonaStatus.ACTIVE,
        ...(params.brandId
          ? { AND: [brandAvailabilityWhere(params.brandId)] }
          : {}),
        ...(prefix
          ? {
              OR: [
                {
                  handle: {
                    mode: 'insensitive' as const,
                    startsWith: prefix.toLowerCase(),
                  },
                },
                {
                  label: {
                    mode: 'insensitive' as const,
                    startsWith: prefix,
                  },
                },
              ],
            }
          : {}),
      }),
    });

    const hasAllBrands = rows.some(
      (row) => row.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS,
    );
    const organizationBrandCount = hasAllBrands
      ? await this.prisma.brand.count({
          where: scopedWhere(params.organizationId),
        })
      : 0;

    const own = rows.flatMap((row) => {
      if (!row.handle) {
        return [];
      }
      return [
        {
          availableBrandCount:
            row.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS
              ? organizationBrandCount
              : resolvePersonaBrandIds(row, []).length,
          avatarIngredientId: row.avatarIngredientId,
          handle: row.handle,
          hasReferenceImage: Boolean(row.avatarIngredientId),
          id: row.id,
          isShared: isPersonaSharedAcrossBrands(row),
          label: row.label,
          owningBrandName: row.brand?.label ?? null,
        },
      ];
    });
    const granted = (
      await this.grants.listForBrand({
        brandId: params.brandId,
        organizationId: params.organizationId,
        prefix,
      })
    ).flatMap((grant) =>
      grant.persona.handle
        ? [
            {
              avatarIngredientId: grant.persona.avatarIngredientId,
              grantedByOrganizationName: grant.ownerOrganization.label,
              handle: grant.persona.handle,
              hasReferenceImage: Boolean(grant.persona.avatarIngredientId),
              id: grant.persona.id,
              isGranted: true,
              label: grant.persona.label,
              owningBrandName: null,
            },
          ]
        : [],
    );
    return [...own, ...granted]
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 20);
  }

  async resolveCharacterHandles(params: {
    brandId?: string | null;
    handles: readonly string[];
    organizationId: string;
    path?: CharacterAdmissionPath;
  }): Promise<CharacterHandleResolution> {
    const requested = params.handles
      .map((handle) => handle.trim())
      .filter((handle) => handle.length > 0);
    if (requested.length === 0) {
      return { resolvedIngredientIds: [], unresolvedHandles: [] };
    }

    const uniqueNormalized: string[] = [];
    const seenNormalized = new Set<string>();
    for (const handle of requested) {
      const normalized = handle.toLowerCase();
      if (seenNormalized.has(normalized)) {
        continue;
      }
      seenNormalized.add(normalized);
      uniqueNormalized.push(normalized);
    }

    // A handle only resolves relative to a brand; with none, nothing does.
    const rows = params.brandId
      ? await this.prisma.persona.findMany({
          select: {
            avatarIngredientId: true,
            handle: true,
          },
          where: scopedWhere(params.organizationId, {
            handle: { in: uniqueNormalized },
            status: PersonaStatus.ACTIVE,
            AND: [brandAvailabilityWhere(params.brandId)],
          }),
        })
      : [];
    const grantedRows = params.brandId
      ? (
          await this.grants.findHandleGrants({
            brandId: params.brandId,
            handles: uniqueNormalized,
            organizationId: params.organizationId,
          })
        ).map((grant) => grant.persona)
      : [];

    const byHandle = new Map<string, string | null>();
    for (const row of [...rows, ...grantedRows]) {
      if (!row.handle) {
        continue;
      }
      byHandle.set(row.handle.toLowerCase(), row.avatarIngredientId);
    }

    const resolvedIngredientIds: string[] = [];
    const unresolvedHandles: string[] = [];
    const seenIds = new Set<string>();
    const seenUnresolved = new Set<string>();
    for (const handle of requested) {
      const normalized = handle.toLowerCase();
      const ingredientId = byHandle.get(normalized);
      if (!ingredientId) {
        if (!seenUnresolved.has(normalized)) {
          seenUnresolved.add(normalized);
          unresolvedHandles.push(handle);
        }
        continue;
      }
      if (seenIds.has(ingredientId)) {
        continue;
      }
      seenIds.add(ingredientId);
      resolvedIngredientIds.push(ingredientId);
    }

    if (unresolvedHandles.length > 0) {
      this.logger.warn('Character handle refused', {
        brandId: params.brandId ?? null,
        handles: unresolvedHandles,
        organizationId: params.organizationId,
        path: params.path ?? 'agent-handles',
      });
    }
    return { resolvedIngredientIds, unresolvedHandles };
  }

  /**
   * The one character admission check every generation path runs. `assetIds`
   * are the library assets a request feeds into a generation: reference
   * images, frames and source media. An id is a character input when it is a
   * character's reference image, or an output already linked to a character.
   * Rejects the request (not-found, before any output or charge) when the
   * character is not available to the active brand, so revoking availability
   * stops new use on the next request. Returns the avatar ids the brand may
   * use across brands plus the character to link the output to. Two indexed
   * queries per request (own characters, and grants to the organization, run
   * in parallel); refusals are logged with path, brand and character.
   */
  async resolveCharacterReferences(params: {
    brandId: string | null | undefined;
    ingredientIds: readonly string[];
    organizationId: string;
    path: CharacterAdmissionPath;
  }): Promise<CharacterAdmission> {
    const ids = [...new Set(params.ingredientIds)];
    if (ids.length === 0) {
      return noCharacterAdmission();
    }
    const [rows, grantRows] = await Promise.all([
      this.prisma.persona.findMany({
        select: {
          availabilityMode: true,
          availableBrandIds: true,
          avatarIngredientId: true,
          brandId: true,
          id: true,
          ingredients: {
            select: { id: true },
            where: { id: { in: ids } },
          },
        },
        where: scopedWhere(params.organizationId, {
          OR: [
            { avatarIngredientId: { in: ids } },
            { ingredients: { some: { id: { in: ids } } } },
          ],
        }),
      }),
      // Characters granted to this organization (#6037), keyed by the grant.
      this.grants.findReferenceGrants({
        ingredientIds: ids,
        organizationId: params.organizationId,
      }),
    ]);
    return evaluateCharacterAdmission({
      brandId: params.brandId,
      grantRows,
      ids,
      onRefused: (refused) => {
        this.logger.warn('Character reference refused', {
          ...refused,
          brandId: params.brandId ?? null,
          organizationId: params.organizationId,
          path: params.path,
        });
        throw new NotFoundException('Reference image');
      },
      rows,
    });
  }

  async createFromApprovedSheet(params: {
    assetId: string;
    availability?: CharacterAvailabilityInput;
    apiKeyContext?: ApiKeyRoleContext;
    brandId: string;
    handle: string;
    isSuperAdmin?: boolean;
    label: string;
    organizationId: string;
    userId: string;
  }): Promise<PersonaDocument> {
    const handle = normalizePersonaHandle(params.handle);
    if (handle === null || !isPersonaHandle(handle)) {
      throw new ValidationException(
        'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
        'handle',
        params.handle,
      );
    }
    const image = await this.prisma.ingredient.findFirst({
      where: {
        id: params.assetId,
        organizationId: params.organizationId,
        brandId: params.brandId,
        isDeleted: false,
        category: {
          in: [IngredientCategory.IMAGE, IngredientCategory.IMAGE_EDIT],
        },
        status: {
          in: [
            IngredientStatus.GENERATED,
            IngredientStatus.UPLOADED,
            IngredientStatus.VALIDATED,
          ],
        },
      },
      select: { id: true },
    });
    if (!image) {
      throw new ValidationException(
        'Choose a completed image from this brand',
        'assetId',
        params.assetId,
      );
    }
    const availability = await this.resolveAvailability({
      brandIds: params.availability?.brandIds,
      mode: params.availability?.mode ?? PersonaAvailabilityMode.OWNING_BRAND,
      organizationId: params.organizationId,
      owningBrandId: params.brandId,
    });
    if (
      availability.availabilityMode !== PersonaAvailabilityMode.OWNING_BRAND
    ) {
      await this.assertCanManageSharing({
        apiKeyContext: params.apiKeyContext,
        isSuperAdmin: params.isSuperAdmin,
        organizationId: params.organizationId,
        userId: params.userId,
      });
    }
    return this.create({
      ...availability,
      avatarIngredientId: image.id,
      brandId: params.brandId,
      handle,
      label: params.label,
      organizationId: params.organizationId,
      status: PersonaStatus.ACTIVE,
      userId: params.userId,
    });
  }

  async isOrganizationOwnerOrAdmin(params: {
    apiKeyContext?: ApiKeyRoleContext;
    organizationId: string;
    userId: string;
  }): Promise<boolean> {
    const member = await this.prisma.member.findFirst({
      include: { role: true },
      where: scopedWhere(params.organizationId, {
        isActive: true,
        userId: params.userId,
      }),
    });
    if (!member) {
      return false;
    }
    const effectiveRole = resolveApiKeyEffectiveMemberRole(
      params.apiKeyContext ?? {},
      member.role.key as MemberRole,
    );
    return [MemberRole.OWNER, MemberRole.ADMIN].includes(effectiveRole);
  }

  async assertCanManageSharing(params: {
    apiKeyContext?: ApiKeyRoleContext;
    isSuperAdmin?: boolean;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    if (params.isSuperAdmin) {
      return;
    }
    if (!(await this.isOrganizationOwnerOrAdmin(params))) {
      throw new ForbiddenException({
        detail:
          'Only an organization owner or admin can share or edit a shared character',
        title: 'Forbidden',
      });
    }
  }

  /**
   * Validate an availability choice against the owning organization and
   * return the persisted shape. `selected brands` always includes the owning
   * brand; every brand must belong to the organization.
   */
  async resolveAvailability(params: {
    brandIds?: readonly string[];
    mode: PersonaAvailabilityMode;
    organizationId: string;
    owningBrandId: string;
  }): Promise<CharacterAvailability> {
    if (params.mode !== PersonaAvailabilityMode.SELECTED_BRANDS) {
      return { availabilityMode: params.mode, availableBrandIds: [] };
    }

    const requested = [...new Set(params.brandIds ?? [])];
    if (requested.length === 0) {
      throw new ValidationException(
        'Choose at least one brand for selected-brands availability',
        'brandIds',
      );
    }
    const brands = await this.prisma.brand.findMany({
      select: { id: true },
      where: scopedWhere(params.organizationId, { id: { in: requested } }),
    });
    if (brands.length !== requested.length) {
      throw new ValidationException(
        'Every brand must belong to this organization',
        'brandIds',
        requested,
      );
    }
    return {
      availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
      availableBrandIds: [...new Set([params.owningBrandId, ...requested])],
    };
  }

  /**
   * Serializes handle checks and writes per organization so two concurrent
   * sharing, create or rename requests cannot both pass validation against
   * the old state.
   */
  withHandleLock<T>(
    organizationId: string,
    work: (tx: PersonaClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await lockPersonaHandleScope(tx, organizationId);
      return work(tx);
    });
  }

  /**
   * A handle must stay unique among the characters a brand can see. Rejects
   * when another live character with the same handle is owned by, or shared
   * to, any brand the character will be available to, naming the handle and
   * the brand.
   */
  async assertNoHandleCollision(params: {
    availability: PersonaAvailabilityFields;
    client?: PersonaClient;
    excludePersonaId?: string;
    handle: string | null | undefined;
    organizationId: string;
    /** Null for a grant, which has no owning brand in the target organization. */
    owningBrandId: string | null;
  }): Promise<void> {
    if (!params.handle) {
      return;
    }
    const client = params.client ?? this.prisma;
    const others = await client.persona.findMany({
      select: {
        availabilityMode: true,
        availableBrandIds: true,
        brandId: true,
      },
      where: scopedWhere(params.organizationId, {
        handle: params.handle,
        ...(params.excludePersonaId
          ? { id: { not: params.excludePersonaId } }
          : {}),
      }),
    });
    // Characters granted into this organization occupy their handle in the
    // brands they were granted to (#6037).
    const grantedIn = await client.personaGrant.findMany({
      select: { availabilityMode: true, availableBrandIds: true },
      where: {
        persona: {
          handle: params.handle,
          id: params.excludePersonaId
            ? { not: params.excludePersonaId }
            : undefined,
          isDeleted: false,
        },
        recipientOrganizationId: params.organizationId,
        revokedAt: null,
      },
    });
    if (others.length === 0 && grantedIn.length === 0) {
      return;
    }

    const brands = await client.brand.findMany({
      select: { id: true, label: true },
      where: scopedWhere(params.organizationId),
    });
    const organizationBrandIds = brands.map((brand) => brand.id);
    const targetBrandIds = new Set([
      ...(params.owningBrandId ? [params.owningBrandId] : []),
      ...resolvePersonaBrandIds(
        { ...params.availability, brandId: params.owningBrandId },
        organizationBrandIds,
      ),
    ]);
    const occupied = new Set([
      ...others.flatMap((other) =>
        resolvePersonaBrandIds(other, organizationBrandIds),
      ),
      ...grantedIn.flatMap((grant) =>
        resolvePersonaBrandIds(
          { ...grant, brandId: null },
          organizationBrandIds,
        ),
      ),
    ]);
    const conflictingBrandId = [...targetBrandIds].find((brandId) =>
      occupied.has(brandId),
    );
    if (conflictingBrandId) {
      const brandLabel = brands.find(
        (brand) => brand.id === conflictingBrandId,
      )?.label;
      throw new ValidationException(
        `A character with the handle @${params.handle} already exists in ${brandLabel ?? 'a target brand'}`,
        'handle',
        params.handle,
      );
    }
  }

  /** The persona if the brand can use it, else null (never reveals others). */
  async findAvailableToBrand(params: {
    brandId: string;
    organizationId: string;
    personaId: string;
  }): Promise<PersonaDocument | null> {
    const persona = await this.prisma.persona.findFirst({
      where: scopedWhere(params.organizationId, { id: params.personaId }),
    });
    if (persona) {
      return isPersonaAvailableToBrand(persona, params.brandId)
        ? this.normalizeDocument(persona)
        : null;
    }
    // Not this organization's character: only an active grant can resolve it.
    const granted = await this.grants.findForBrand(params);
    return granted ? this.normalizeDocument(granted) : null;
  }

  async updateAvailability(params: {
    actorUserId: string;
    brandId: string;
    brandIds?: readonly string[];
    apiKeyContext?: ApiKeyRoleContext;
    isSuperAdmin?: boolean;
    mode: PersonaAvailabilityMode;
    organizationId: string;
    personaId: string;
  }): Promise<PersonaDocument> {
    const persona = await this.prisma.persona.findFirst({
      where: scopedWhere(params.organizationId, { id: params.personaId }),
    });
    if (!persona || !isPersonaAvailableToBrand(persona, params.brandId)) {
      throw new NotFoundException('Persona', params.personaId);
    }
    await this.assertCanManageSharing({
      apiKeyContext: params.apiKeyContext,
      isSuperAdmin: params.isSuperAdmin,
      organizationId: params.organizationId,
      userId: params.actorUserId,
    });
    if (!persona.brandId) {
      throw new ValidationException(
        'A character needs an owning brand before it can be shared',
        'brandId',
      );
    }

    const availability = await this.resolveAvailability({
      brandIds: params.brandIds,
      mode: params.mode,
      organizationId: params.organizationId,
      owningBrandId: persona.brandId,
    });
    const owningBrandId = persona.brandId;
    await this.withHandleLock(params.organizationId, async (tx) => {
      // Re-read under the lock so a concurrent change cannot slip past.
      const locked = await tx.persona.findFirst({
        where: scopedWhere(params.organizationId, { id: persona.id }),
      });
      if (!locked) {
        throw new NotFoundException('Persona', params.personaId);
      }
      if (
        availability.availabilityMode !== PersonaAvailabilityMode.OWNING_BRAND
      ) {
        await this.assertNoHandleCollision({
          availability,
          client: tx,
          excludePersonaId: persona.id,
          handle: locked.handle,
          organizationId: params.organizationId,
          owningBrandId,
        });
      }
      await tx.persona.update({
        data: availability,
        where: scopedWhere(params.organizationId, { id: persona.id }),
      });
      await tx.personaAvailabilityAudit.create({
        data: {
          actorUserId: params.actorUserId,
          newBrandIds: availability.availableBrandIds,
          newMode: availability.availabilityMode,
          organizationId: params.organizationId,
          personaId: persona.id,
          previousBrandIds: locked.availableBrandIds,
          previousMode: locked.availabilityMode,
        },
      });
    });

    const updated = await this.findOne({ id: persona.id });
    if (!updated) {
      throw new NotFoundException('Persona', params.personaId);
    }
    return updated;
  }

  /**
   * Adds the read-model summary: `isShared`, and `availableBrandCount` (every
   * organization brand for `all brands`).
   */
  async withAvailabilitySummary(
    docs: PersonaDocument[],
    organizationId: string,
  ): Promise<PersonaDocument[]> {
    let organizationBrandCount: number | null = null;
    for (const doc of docs) {
      if (doc.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS) {
        organizationBrandCount ??= await this.prisma.brand.count({
          where: scopedWhere(organizationId),
        });
      }
    }
    return docs.map((doc) => ({
      ...doc,
      availableBrandCount:
        doc.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS
          ? (organizationBrandCount ?? 0)
          : resolvePersonaBrandIds(doc, []).length,
      isShared: isPersonaSharedAcrossBrands(doc),
      owningBrandId: doc.brandId ?? null,
      owningBrandName:
        (doc.brand as { label?: string | null } | null | undefined)?.label ??
        null,
    }));
  }

  async assignMembers(
    personaId: string,
    memberIds: string[],
    organizationId: string,
  ): Promise<PersonaDocument | null> {
    const persona = await this.prisma.persona.update({
      data: {
        assignedMembers: { set: memberIds.map((id) => ({ id })) },
      },
      where: scopedWhere(organizationId, { id: personaId }),
    });

    if (!persona) {
      throw new NotFoundException('Persona');
    }

    return this.normalizeDocument(persona);
  }
}

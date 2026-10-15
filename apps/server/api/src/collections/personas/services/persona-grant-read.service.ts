import { isPersonaAvailableToBrand } from '@api/collections/personas/utils/persona-availability.util';
import {
  PERSONA_REFERENCES_SELECT,
  personaReferencesAnyWhere,
} from '@api/collections/personas/utils/persona-references.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PersonaStatus } from '@genfeedai/contracts';
import type { PersonaAvailabilityFields } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

const GRANT_PERSONA_SELECT = {
  avatarIngredientId: true,
  config: true,
  description: true,
  handle: true,
  id: true,
  label: true,
  references: PERSONA_REFERENCES_SELECT,
  status: true,
} as const;

/** The owner check reads these; they never reach the receiving organization. */
const OWNER_CHECK_PERSONA_SELECT = { organizationId: true } as const;

interface OwnerCheckedGrantRow {
  ownerOrganizationId: string;
  persona: { organizationId: string };
}

type WithoutOwnerOrganization<T extends OwnerCheckedGrantRow> = Omit<
  T,
  'persona'
> & { persona: Omit<T['persona'], 'organizationId'> };

/**
 * A grant is only good while its character still belongs to the organization
 * that issued it. When a character's brand moves to another organization its
 * grants are revoked in the same transaction; this read check refuses any grant
 * that still names the previous owner (an older row, a race), so the new owner's
 * character is never shared on the previous owner's word. The owner's
 * organization id is dropped from the rows handed back.
 */
function keepGrantsOfCurrentOwner<T extends OwnerCheckedGrantRow>(
  rows: readonly T[],
): Array<WithoutOwnerOrganization<T>> {
  return rows
    .filter((row) => row.ownerOrganizationId === row.persona.organizationId)
    .map((row) => {
      const { organizationId: _owner, ...persona } = row.persona;
      return { ...row, persona } as WithoutOwnerOrganization<T>;
    });
}

/**
 * Grants read from the receiving side (#6037). Every query is keyed by the
 * caller's own organization on the grant table, and only an active grant
 * (`revokedAt` null) yields a row, so a revoked or missing grant matches
 * nothing and never reveals the character.
 */
@Injectable()
export class PersonaGrantReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active grants whose character has any of the assets as a reference image
   * (primary or not), or has outputs among them.
   */
  async findReferenceGrants(params: {
    ingredientIds: readonly string[];
    organizationId: string;
  }) {
    const ids = [...params.ingredientIds];
    const rows = await this.prisma.personaGrant.findMany({
      select: {
        availabilityMode: true,
        availableBrandIds: true,
        ownerOrganizationId: true,
        persona: {
          select: {
            avatarIngredientId: true,
            id: true,
            ingredients: { select: { id: true }, where: { id: { in: ids } } },
            references: {
              select: { ingredientId: true, position: true },
              where: { ingredientId: { in: ids } },
            },
            ...OWNER_CHECK_PERSONA_SELECT,
          },
        },
      },
      where: {
        persona: {
          is: {
            isDeleted: false,
            OR: [
              ...personaReferencesAnyWhere(ids),
              { ingredients: { some: { id: { in: ids } } } },
            ],
          },
        },
        recipientOrganizationId: params.organizationId,
        revokedAt: null,
      },
    });
    return keepGrantsOfCurrentOwner(rows);
  }

  /**
   * Outputs of the organization already linked to a character, whichever
   * organization owns that character, so a revoked grant refuses them.
   */
  findLinkedOutputs(ingredientIds: readonly string[], organizationId: string) {
    return this.prisma.ingredient.findMany({
      select: { id: true, personaId: true },
      where: scopedWhere(organizationId, {
        id: { in: [...ingredientIds] },
        personaId: { not: null },
      }),
    });
  }

  /** Granted characters usable by the brand, by handle. */
  async findHandleGrants(params: {
    brandId: string;
    handles: readonly string[];
    organizationId: string;
  }) {
    const rows = await this.prisma.personaGrant.findMany({
      select: {
        availabilityMode: true,
        availableBrandIds: true,
        ownerOrganizationId: true,
        persona: {
          select: {
            avatarIngredientId: true,
            handle: true,
            references: PERSONA_REFERENCES_SELECT,
            ...OWNER_CHECK_PERSONA_SELECT,
          },
        },
      },
      where: {
        persona: {
          is: {
            handle: { in: [...params.handles] },
            isDeleted: false,
            status: PersonaStatus.ACTIVE,
          },
        },
        recipientOrganizationId: params.organizationId,
        revokedAt: null,
      },
    });
    return keepGrantsOfCurrentOwner(rows).filter((row) =>
      this.isUsableBy(row, params.brandId),
    );
  }

  /** Granted characters usable by the brand, for pickers and mentions. */
  async listForBrand(params: {
    brandId: string | null | undefined;
    organizationId: string;
    prefix?: string;
  }) {
    if (!params.brandId) {
      return [];
    }
    const prefix = params.prefix?.trim();
    const rows = await this.prisma.personaGrant.findMany({
      select: {
        availabilityMode: true,
        availableBrandIds: true,
        id: true,
        ownerOrganization: { select: { label: true } },
        ownerOrganizationId: true,
        persona: {
          select: { ...GRANT_PERSONA_SELECT, ...OWNER_CHECK_PERSONA_SELECT },
        },
      },
      where: {
        persona: {
          is: {
            isDeleted: false,
            status: PersonaStatus.ACTIVE,
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
          },
        },
        recipientOrganizationId: params.organizationId,
        revokedAt: null,
      },
    });
    const brandId = params.brandId;
    return keepGrantsOfCurrentOwner(rows).filter((row) =>
      this.isUsableBy(row, brandId),
    );
  }

  /** One granted character if the brand can use it, else null. */
  async findForBrand(params: {
    brandId: string;
    organizationId: string;
    personaId: string;
  }) {
    const row = await this.prisma.personaGrant.findFirst({
      select: {
        availabilityMode: true,
        availableBrandIds: true,
        ownerOrganizationId: true,
        persona: true,
      },
      where: {
        persona: { is: { id: params.personaId, isDeleted: false } },
        recipientOrganizationId: params.organizationId,
        revokedAt: null,
      },
    });
    if (!row || row.ownerOrganizationId !== row.persona.organizationId) {
      return null;
    }
    return this.isUsableBy(row, params.brandId) ? row.persona : null;
  }

  private isUsableBy(
    grant: Omit<PersonaAvailabilityFields, 'brandId'>,
    brandId: string,
  ): boolean {
    return isPersonaAvailableToBrand({ ...grant, brandId: null }, brandId);
  }
}

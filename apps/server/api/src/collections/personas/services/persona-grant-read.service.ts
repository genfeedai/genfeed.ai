import { isPersonaAvailableToBrand } from '@api/collections/personas/utils/persona-availability.util';
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
  status: true,
} as const;

/**
 * Grants read from the receiving side (#6037). Every query is keyed by the
 * caller's own organization on the grant table, and only an active grant
 * (`revokedAt` null) yields a row, so a revoked or missing grant matches
 * nothing and never reveals the character.
 */
@Injectable()
export class PersonaGrantReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active grants whose character owns, or has outputs among, the assets. */
  findReferenceGrants(params: {
    ingredientIds: readonly string[];
    organizationId: string;
  }) {
    const ids = [...params.ingredientIds];
    return this.prisma.personaGrant.findMany({
      select: {
        availabilityMode: true,
        availableBrandIds: true,
        ownerOrganizationId: true,
        persona: {
          select: {
            avatarIngredientId: true,
            id: true,
            ingredients: { select: { id: true }, where: { id: { in: ids } } },
          },
        },
      },
      where: {
        persona: {
          is: {
            isDeleted: false,
            OR: [
              { avatarIngredientId: { in: ids } },
              { ingredients: { some: { id: { in: ids } } } },
            ],
          },
        },
        recipientOrganizationId: params.organizationId,
        revokedAt: null,
      },
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
        persona: { select: { avatarIngredientId: true, handle: true } },
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
    return rows.filter((row) => this.isUsableBy(row, params.brandId));
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
        persona: { select: GRANT_PERSONA_SELECT },
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
    return rows.filter((row) => this.isUsableBy(row, brandId));
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
        persona: true,
      },
      where: {
        persona: { is: { id: params.personaId, isDeleted: false } },
        recipientOrganizationId: params.organizationId,
        revokedAt: null,
      },
    });
    return row && this.isUsableBy(row, params.brandId) ? row.persona : null;
  }

  private isUsableBy(
    grant: Omit<PersonaAvailabilityFields, 'brandId'>,
    brandId: string,
  ): boolean {
    return isPersonaAvailableToBrand({ ...grant, brandId: null }, brandId);
  }
}

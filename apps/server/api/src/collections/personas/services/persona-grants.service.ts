import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { isPersonaAvailableToBrand } from '@api/collections/personas/utils/persona-availability.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole, PersonaAvailabilityMode } from '@genfeedai/contracts';
import { ForbiddenException, Injectable } from '@nestjs/common';

type ApiKeyRoleContext = Pick<AuthenticatedUser, 'isApiKey' | 'scopes'>;

export type GrantableMode =
  | PersonaAvailabilityMode.ALL_BRANDS
  | PersonaAvailabilityMode.SELECTED_BRANDS;

export interface CharacterGrantView {
  availabilityMode: string;
  availableBrandIds: string[];
  grantedAt: Date;
  id: string;
  recipientOrganizationId: string;
  recipientOrganizationName: string;
}

/**
 * Use-only grants of a character to another organization (#6037). Writing
 * needs owner/admin rights in both organizations at that moment; the grant
 * carries identity only and the receiving organization pays for what it
 * generates.
 */
@Injectable()
export class PersonaGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personas: PersonasService,
  ) {}

  /** Organizations other than the current one that the actor owns or administers. */
  async listGrantableOrganizations(params: {
    apiKeyContext?: ApiKeyRoleContext;
    organizationId: string;
    userId: string;
  }): Promise<
    Array<{
      brands: Array<{ id: string; label: string }>;
      id: string;
      label: string;
    }>
  > {
    const memberships = await this.prisma.member.findMany({
      select: {
        organization: { select: { id: true, label: true } },
        organizationId: true,
        role: { select: { key: true } },
      },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: { not: params.organizationId },
        userId: params.userId,
      },
    });
    const administered = memberships.filter((member) =>
      this.isAdminRole(params.apiKeyContext, member.role.key as MemberRole),
    );
    if (administered.length === 0) {
      return [];
    }
    // The brands the actor can pick as the grant's receiving availability.
    const brands = await this.prisma.brand.findMany({
      orderBy: { label: 'asc' },
      select: { id: true, label: true, organizationId: true },
      where: {
        isDeleted: false,
        organizationId: {
          in: administered.map((member) => member.organizationId),
        },
      },
    });
    return administered.map((member) => ({
      brands: brands
        .filter((brand) => brand.organizationId === member.organizationId)
        .map(({ id, label }) => ({ id, label })),
      id: member.organization.id,
      label: member.organization.label,
    }));
  }

  async listForPersona(params: {
    brandId: string;
    organizationId: string;
    personaId: string;
  }): Promise<CharacterGrantView[]> {
    await this.requireOwnedPersona(params);
    const grants = await this.prisma.personaGrant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        availabilityMode: true,
        availableBrandIds: true,
        createdAt: true,
        id: true,
        recipientOrganization: { select: { id: true, label: true } },
      },
      where: {
        ownerOrganizationId: params.organizationId,
        personaId: params.personaId,
        revokedAt: null,
      },
    });
    return grants.map((grant) => ({
      availabilityMode: grant.availabilityMode,
      availableBrandIds: grant.availableBrandIds ?? [],
      grantedAt: grant.createdAt,
      id: grant.id,
      recipientOrganizationId: grant.recipientOrganization.id,
      recipientOrganizationName: grant.recipientOrganization.label,
    }));
  }

  /** Creates the active grant, or updates its availability (one per pair). */
  async grant(params: {
    actorUserId: string;
    apiKeyContext?: ApiKeyRoleContext;
    brandId: string;
    brandIds?: readonly string[];
    mode: GrantableMode;
    organizationId: string;
    personaId: string;
    recipientOrganizationId: string;
  }): Promise<{ id: string }> {
    if (params.recipientOrganizationId === params.organizationId) {
      throw new ValidationException(
        'Choose another organization to grant the character to',
        'organizationId',
      );
    }
    const persona = await this.requireOwnedPersona(params);
    await this.assertAdminOf(params, params.organizationId);
    await this.assertAdminOf(params, params.recipientOrganizationId);

    const availableBrandIds = await this.resolveRecipientBrands(params);
    const availability = {
      availabilityMode: params.mode,
      availableBrandIds,
    };

    return this.personas.withHandleLock(
      params.recipientOrganizationId,
      async (tx) => {
        await this.personas.assertNoHandleCollision({
          availability: { ...availability, brandId: null },
          client: tx,
          excludePersonaId: persona.id,
          handle: persona.handle,
          organizationId: params.recipientOrganizationId,
          owningBrandId: null,
        });
        const existing = await tx.personaGrant.findFirst({
          where: {
            personaId: persona.id,
            recipientOrganizationId: params.recipientOrganizationId,
            revokedAt: null,
          },
        });
        const grant = existing
          ? await tx.personaGrant.update({
              data: availability,
              where: { id: existing.id },
            })
          : await tx.personaGrant.create({
              data: {
                ...availability,
                grantedByUserId: params.actorUserId,
                ownerOrganizationId: params.organizationId,
                personaId: persona.id,
                recipientOrganizationId: params.recipientOrganizationId,
              },
            });
        await tx.personaGrantAudit.create({
          data: {
            action: existing ? 'updated' : 'granted',
            actorUserId: params.actorUserId,
            grantId: grant.id,
            newBrandIds: availableBrandIds,
            newMode: params.mode,
            ownerOrganizationId: params.organizationId,
            personaId: persona.id,
            previousBrandIds: existing?.availableBrandIds ?? [],
            previousMode: existing?.availabilityMode ?? null,
            recipientOrganizationId: params.recipientOrganizationId,
          },
        });
        return { id: grant.id };
      },
    );
  }

  /**
   * Revokes with immediate effect. Any current owner or admin of the owning
   * organization may revoke, so a grant is never stranded when the granter
   * later loses rights in the receiving organization. Outputs already made
   * keep their character link.
   */
  async revoke(params: {
    actorUserId: string;
    apiKeyContext?: ApiKeyRoleContext;
    brandId: string;
    grantId: string;
    organizationId: string;
    personaId: string;
  }): Promise<void> {
    await this.requireOwnedPersona(params);
    await this.assertAdminOf(params, params.organizationId);

    const grant = await this.prisma.personaGrant.findFirst({
      where: {
        id: params.grantId,
        ownerOrganizationId: params.organizationId,
        personaId: params.personaId,
        revokedAt: null,
      },
    });
    if (!grant) {
      throw new NotFoundException('Character grant', params.grantId);
    }
    await this.personas.withHandleLock(
      grant.recipientOrganizationId,
      async (tx) => {
        const updated = await tx.personaGrant.updateMany({
          data: {
            revokedAt: new Date(),
            revokedByUserId: params.actorUserId,
          },
          where: {
            id: grant.id,
            ownerOrganizationId: params.organizationId,
            revokedAt: null,
          },
        });
        if (updated.count !== 1) {
          throw new NotFoundException('Character grant', params.grantId);
        }
        await tx.personaGrantAudit.create({
          data: {
            action: 'revoked',
            actorUserId: params.actorUserId,
            grantId: grant.id,
            newBrandIds: [],
            newMode: null,
            ownerOrganizationId: params.organizationId,
            personaId: params.personaId,
            previousBrandIds: grant.availableBrandIds ?? [],
            previousMode: grant.availabilityMode,
            recipientOrganizationId: grant.recipientOrganizationId,
          },
        });
      },
    );
  }

  private async requireOwnedPersona(params: {
    brandId: string;
    organizationId: string;
    personaId: string;
  }) {
    const persona = await this.prisma.persona.findFirst({
      where: scopedWhere(params.organizationId, { id: params.personaId }),
    });
    if (!persona || !isPersonaAvailableToBrand(persona, params.brandId)) {
      throw new NotFoundException('Persona', params.personaId);
    }
    return persona;
  }

  private async resolveRecipientBrands(params: {
    brandIds?: readonly string[];
    mode: GrantableMode;
    recipientOrganizationId: string;
  }): Promise<string[]> {
    const recipient = await this.prisma.organization.findFirst({
      select: { id: true },
      where: { id: params.recipientOrganizationId, isDeleted: false },
    });
    if (!recipient) {
      throw new NotFoundException(
        'Organization',
        params.recipientOrganizationId,
      );
    }
    if (params.mode !== PersonaAvailabilityMode.SELECTED_BRANDS) {
      return [];
    }
    const requested = [...new Set(params.brandIds ?? [])];
    if (requested.length === 0) {
      throw new ValidationException(
        'Choose at least one brand of the receiving organization',
        'brandIds',
      );
    }
    const brands = await this.prisma.brand.findMany({
      select: { id: true },
      where: scopedWhere(params.recipientOrganizationId, {
        id: { in: requested },
      }),
    });
    if (brands.length !== requested.length) {
      throw new ValidationException(
        'Every brand must belong to the receiving organization',
        'brandIds',
        requested,
      );
    }
    return requested;
  }

  private async assertAdminOf(
    params: { actorUserId: string; apiKeyContext?: ApiKeyRoleContext },
    organizationId: string,
  ): Promise<void> {
    const isAdmin = await this.personas.isOrganizationOwnerOrAdmin({
      apiKeyContext: params.apiKeyContext,
      organizationId,
      userId: params.actorUserId,
    });
    if (!isAdmin) {
      throw new ForbiddenException({
        detail:
          'Only an owner or admin of both organizations can grant or change a character grant',
        title: 'Forbidden',
      });
    }
  }

  private isAdminRole(
    apiKeyContext: ApiKeyRoleContext | undefined,
    role: MemberRole,
  ): boolean {
    return [MemberRole.OWNER, MemberRole.ADMIN].includes(
      resolveApiKeyEffectiveMemberRole(apiKeyContext ?? {}, role),
    );
  }
}

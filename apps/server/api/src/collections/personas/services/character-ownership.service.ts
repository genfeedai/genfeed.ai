import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import {
  hasSharedAvailability,
  isPersonaAvailableToBrand,
} from '@api/collections/personas/utils/persona-availability.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

type ApiKeyRoleContext = Pick<AuthenticatedUser, 'isApiKey' | 'scopes'>;

/** Moves a shared character's owning brand (#6040). */
@Injectable()
export class CharacterOwnershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personas: PersonasService,
  ) {}

  /**
   * Moves a shared character's owning brand to another brand in its
   * availability (#6040), so the old owner can then be deleted. Availability
   * is kept as is. Owner/admin only, handle-collision checked under the same
   * lock as sharing changes, and audited.
   */
  async moveOwnership(params: {
    actorUserId: string;
    apiKeyContext?: ApiKeyRoleContext;
    brandId: string;
    isSuperAdmin?: boolean;
    organizationId: string;
    personaId: string;
    targetBrandId: string;
  }): Promise<PersonaDocument> {
    const persona = await this.prisma.persona.findFirst({
      where: scopedWhere(params.organizationId, { id: params.personaId }),
    });
    if (!persona || !isPersonaAvailableToBrand(persona, params.brandId)) {
      throw new NotFoundException('Persona', params.personaId);
    }
    await this.personas.assertCanManageSharing({
      apiKeyContext: params.apiKeyContext,
      isSuperAdmin: params.isSuperAdmin,
      organizationId: params.organizationId,
      userId: params.actorUserId,
    });

    await this.personas.withHandleLock(params.organizationId, async (tx) => {
      // Re-read under the lock so a concurrent change cannot slip past.
      const locked = await tx.persona.findFirst({
        where: scopedWhere(params.organizationId, { id: persona.id }),
      });
      if (!locked) {
        throw new NotFoundException('Persona', params.personaId);
      }
      if (!locked.brandId) {
        throw new ValidationException(
          'A character needs an owning brand before its ownership can move',
          'brandId',
        );
      }
      if (!hasSharedAvailability(locked)) {
        throw new ValidationException(
          'Only a shared character can move to another owning brand',
          'brandId',
        );
      }
      if (locked.brandId === params.targetBrandId) {
        throw new ValidationException(
          'The character is already owned by this brand',
          'brandId',
          params.targetBrandId,
        );
      }
      const targetBrand = await tx.brand.findFirst({
        select: { id: true },
        where: scopedWhere(params.organizationId, {
          id: params.targetBrandId,
        }),
      });
      if (
        !targetBrand ||
        !isPersonaAvailableToBrand(locked, params.targetBrandId)
      ) {
        throw new ValidationException(
          'The new owning brand must be one of the brands the character is available to',
          'brandId',
          params.targetBrandId,
        );
      }
      await this.personas.assertNoHandleCollision({
        availability: locked,
        client: tx,
        excludePersonaId: locked.id,
        handle: locked.handle,
        organizationId: params.organizationId,
        owningBrandId: params.targetBrandId,
      });
      await tx.persona.update({
        data: { brandId: params.targetBrandId },
        where: scopedWhere(params.organizationId, { id: locked.id }),
      });
      await tx.personaAvailabilityAudit.create({
        data: {
          actorUserId: params.actorUserId,
          newBrandIds: locked.availableBrandIds,
          newMode: locked.availabilityMode,
          newOwningBrand: params.targetBrandId,
          organizationId: params.organizationId,
          personaId: locked.id,
          previousBrandIds: locked.availableBrandIds,
          previousMode: locked.availabilityMode,
          previousOwningBrand: locked.brandId,
        },
      });
    });

    const updated = await this.personas.findOne({ id: persona.id });
    if (!updated) {
      throw new NotFoundException('Persona', params.personaId);
    }
    return updated;
  }
}

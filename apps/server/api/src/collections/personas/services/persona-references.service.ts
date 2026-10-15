import type {
  PersonaReferenceRow,
  PersonaReferenceScope,
  PersonaReferencesClient,
} from '@api/collections/personas/services/persona-references.types';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import {
  hasSharedAvailability,
  isPersonaAvailableToBrand,
} from '@api/collections/personas/utils/persona-availability.util';
import {
  characterAssetIdsFromRow,
  findCharacterReferenceImageIds,
  loadOrderedReferenceIds,
  orderedReferenceIdsFromRow,
  PERSONA_REFERENCES_SELECT,
  personaReferencesAnyWhere,
} from '@api/collections/personas/utils/persona-references.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MAX_CHARACTER_REFERENCES } from '@genfeedai/contracts/constants';
import type {
  CharacterReferenceItem,
  CharacterReferenceUsage,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const PERSONA_WITH_REFERENCES_SELECT = {
  availabilityMode: true,
  availableBrandIds: true,
  avatarIngredientId: true,
  brandId: true,
  id: true,
  references: PERSONA_REFERENCES_SELECT,
  userId: true,
} as const;

type PersonaWithReferencesRow = Prisma.PersonaGetPayload<{
  select: typeof PERSONA_WITH_REFERENCES_SELECT;
}>;

function toReferenceItems(ids: readonly string[]): CharacterReferenceItem[] {
  return ids.map((ingredientId, position) => ({ ingredientId, position }));
}

function storedIds(references: readonly PersonaReferenceRow[]): string[] {
  return [...references]
    .sort((a, b) => a.position - b.position)
    .map((reference) => reference.ingredientId);
}

/**
 * Ordered reference images of a character. Position 0 is the primary
 * reference and stays mirrored to `Persona.avatarIngredientId` (single-image
 * readers). Rows are hard-deleted on removal; a soft-deleted asset stays as a
 * row, is skipped by every reader and returns when the asset is restored.
 *
 * Writes run in one transaction holding a per-character advisory lock, so two
 * concurrent edits cannot both pass the cap or interleave positions. A
 * character created before references existed (only `avatarIngredientId`)
 * gets that image stored as its primary row on the first write.
 */
@Injectable()
export class PersonaReferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly personas: PersonasService,
  ) {}

  /** Ordered live reference ids per persona of the organization, one query. */
  getOrderedReferenceIds(
    organizationId: string,
    personaIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    return loadOrderedReferenceIds(this.prisma, organizationId, personaIds);
  }

  async list(params: {
    brandId: string | null | undefined;
    organizationId: string;
    personaId: string;
  }): Promise<CharacterReferenceItem[]> {
    const persona = await this.readPersona(
      this.prisma,
      params.organizationId,
      params.personaId,
    );
    if (!persona || !isPersonaAvailableToBrand(persona, params.brandId)) {
      throw new NotFoundException('Persona', params.personaId);
    }
    return toReferenceItems(orderedReferenceIdsFromRow(persona));
  }

  /**
   * Appends images, in the given order, after the current references. Ids
   * already referenced are skipped, so a retry is a no-op.
   */
  async add(
    params: PersonaReferenceScope & { ingredientIds: readonly string[] },
  ): Promise<CharacterReferenceItem[]> {
    const requested = [...new Set(params.ingredientIds)];
    if (requested.length === 0) {
      throw new ValidationException(
        'Choose at least one image',
        'ingredientIds',
      );
    }
    const brandId = await this.assertManageable(params);
    await this.assertReferenceImages({
      brandId,
      ingredientIds: requested,
      organizationId: params.organizationId,
    });

    return this.withPersonaLock(params, async (tx, persona) => {
      const current = orderedReferenceIdsFromRow(persona);
      const stored = new Set(storedIds(persona.references));
      const added = requested.filter((id) => !stored.has(id));
      if (current.length + added.length > MAX_CHARACTER_REFERENCES) {
        throw new ValidationException(
          `A character can have at most ${MAX_CHARACTER_REFERENCES} reference images`,
          'ingredientIds',
          params.ingredientIds,
        );
      }
      if (added.length > 0) {
        const nextPosition =
          persona.references.reduce(
            (max, reference) => Math.max(max, reference.position),
            -1,
          ) + 1;
        await tx.personaReference.createMany({
          data: added.map((ingredientId, index) => ({
            ingredientId,
            organizationId: params.organizationId,
            personaId: persona.id,
            position: nextPosition + index,
          })),
          skipDuplicates: true,
        });
      }
      return this.finishWrite(tx, params.organizationId, persona.id);
    });
  }

  /** Removes one reference and closes the gap; the next one becomes primary. */
  async remove(
    params: PersonaReferenceScope & { ingredientId: string },
  ): Promise<CharacterReferenceItem[]> {
    await this.assertManageable(params);
    return this.withPersonaLock(params, async (tx, persona) => {
      const ids = storedIds(persona.references);
      if (!ids.includes(params.ingredientId)) {
        throw new NotFoundException('Character reference', params.ingredientId);
      }
      await tx.personaReference.deleteMany({
        where: {
          ingredientId: params.ingredientId,
          organizationId: params.organizationId,
          personaId: persona.id,
        },
      });
      await this.writePositions(
        tx,
        params.organizationId,
        persona,
        ids.filter((id) => id !== params.ingredientId),
      );
      return this.finishWrite(tx, params.organizationId, persona.id);
    });
  }

  /**
   * Rewrites the order. `ingredientIds` must be exactly the current live
   * references; references whose asset is in the trash keep their relative
   * order after them.
   */
  async reorder(
    params: PersonaReferenceScope & { ingredientIds: readonly string[] },
  ): Promise<CharacterReferenceItem[]> {
    await this.assertManageable(params);
    return this.withPersonaLock(params, async (tx, persona) => {
      const current = orderedReferenceIdsFromRow(persona);
      const requested = [...params.ingredientIds];
      const isSameSet =
        requested.length === current.length &&
        new Set(requested).size === requested.length &&
        requested.every((id) => current.includes(id));
      if (!isSameSet) {
        throw new ValidationException(
          'Send every current reference image exactly once',
          'ingredientIds',
          params.ingredientIds,
        );
      }
      const hidden = storedIds(persona.references).filter(
        (id) => !current.includes(id),
      );
      await this.writePositions(tx, params.organizationId, persona, [
        ...requested,
        ...hidden,
      ]);
      return this.finishWrite(tx, params.organizationId, persona.id);
    });
  }

  /**
   * Makes an image the primary reference (generic persona PATCH of
   * `avatarIngredientId`): moved to position 0 when already a reference,
   * inserted there otherwise. `null` removes the current primary reference.
   */
  async setPrimary(
    params: PersonaReferenceScope & { ingredientId: string | null },
  ): Promise<CharacterReferenceItem[]> {
    const brandId = await this.assertManageable(params);
    const { ingredientId } = params;
    if (ingredientId) {
      await this.assertReferenceImages({
        brandId,
        ingredientIds: [ingredientId],
        organizationId: params.organizationId,
      });
    }
    return this.withPersonaLock(params, async (tx, persona) => {
      const ids = storedIds(persona.references);
      if (ingredientId === null) {
        const [primary] = orderedReferenceIdsFromRow(persona);
        if (primary) {
          await tx.personaReference.deleteMany({
            where: {
              ingredientId: primary,
              organizationId: params.organizationId,
              personaId: persona.id,
            },
          });
          await this.writePositions(
            tx,
            params.organizationId,
            persona,
            ids.filter((id) => id !== primary),
          );
        }
        return this.finishWrite(tx, params.organizationId, persona.id);
      }
      const isNew = !ids.includes(ingredientId);
      if (isNew) {
        if (
          orderedReferenceIdsFromRow(persona).length + 1 >
          MAX_CHARACTER_REFERENCES
        ) {
          throw new ValidationException(
            `A character can have at most ${MAX_CHARACTER_REFERENCES} reference images`,
            'avatarIngredientId',
            ingredientId,
          );
        }
        await tx.personaReference.createMany({
          data: [
            {
              ingredientId,
              organizationId: params.organizationId,
              personaId: persona.id,
              position: 0,
            },
          ],
          skipDuplicates: true,
        });
      }
      await this.writePositions(
        tx,
        params.organizationId,
        {
          id: persona.id,
          references: isNew
            ? [...persona.references, { ingredientId, position: 0 }]
            : persona.references,
        },
        [ingredientId, ...ids.filter((id) => id !== ingredientId)],
      );
      return this.finishWrite(tx, params.organizationId, persona.id);
    });
  }

  /**
   * Mirrors the first live reference to `avatarIngredientId` (null when there
   * is none). A character with only `avatarIngredientId` first gets it stored
   * as its primary row, so trashing that asset clears the mirror and a
   * restore brings it back.
   */
  async syncPrimary(
    client: PersonaReferencesClient,
    organizationId: string,
    personaId: string,
  ): Promise<string | null> {
    const persona = await this.materialize(
      client,
      organizationId,
      await this.readPersona(client, organizationId, personaId),
    );
    return persona ? this.mirrorPrimary(client, organizationId, persona) : null;
  }

  /**
   * Re-mirrors the primary reference of every character using any of the
   * assets, after they were moved to or restored from the trash.
   */
  async resyncForIngredients(
    organizationId: string,
    ingredientIds: readonly string[],
  ): Promise<void> {
    const ids = [...new Set(ingredientIds)];
    if (!organizationId || ids.length === 0) {
      return;
    }
    const personas = await this.prisma.persona.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, {
        OR: personaReferencesAnyWhere(ids),
      }),
    });
    for (const persona of personas) {
      await this.prisma.$transaction(async (tx) => {
        await this.lockPersona(tx, persona.id);
        await this.syncPrimary(tx, organizationId, persona.id);
      });
    }
    if (personas.length > 0) {
      this.logger.debug('Character primary references re-synced', {
        ingredientIds: ids,
        organizationId,
        personaIds: personas.map((persona) => persona.id),
      });
    }
  }

  /**
   * Live characters of the organization using each asset as a reference
   * image (including a character's sole `avatarIngredientId`), for a warning
   * before the asset is deleted. One entry per requested id, in order.
   */
  async findReferenceUsage(
    organizationId: string,
    ingredientIds: readonly string[],
  ): Promise<CharacterReferenceUsage[]> {
    const ids = [...new Set(ingredientIds)];
    if (ids.length === 0) {
      return [];
    }
    const personas = await this.prisma.persona.findMany({
      orderBy: { label: 'asc' },
      select: {
        avatarIngredientId: true,
        handle: true,
        id: true,
        label: true,
        references: {
          select: { ingredientId: true, position: true },
          where: { ingredientId: { in: ids } },
        },
      },
      where: scopedWhere(organizationId, {
        OR: personaReferencesAnyWhere(ids),
      }),
    });
    return ids.map((ingredientId) => ({
      characters: personas
        .filter((persona) =>
          characterAssetIdsFromRow(persona).includes(ingredientId),
        )
        .map((persona) => ({
          handle: persona.handle,
          id: persona.id,
          label: persona.label,
        })),
      ingredientId,
    }));
  }

  /**
   * Not-found unless the character is in the organization and available to
   * the active brand; editing a shared character's references is an identity
   * edit, limited to organization owners and admins (as the generic PATCH).
   */
  private async assertManageable(
    params: PersonaReferenceScope,
  ): Promise<string> {
    const persona = await this.readPersona(
      this.prisma,
      params.organizationId,
      params.personaId,
    );
    if (
      !persona ||
      !params.brandId ||
      !isPersonaAvailableToBrand(persona, params.brandId)
    ) {
      throw new NotFoundException('Persona', params.personaId);
    }
    if (hasSharedAvailability(persona)) {
      await this.personas.assertCanManageSharing({
        apiKeyContext: params.actor.apiKeyContext,
        isSuperAdmin: params.actor.isSuperAdmin,
        organizationId: params.organizationId,
        userId: params.actor.userId,
      });
    } else if (
      persona.userId !== params.actor.userId &&
      params.actor.isSuperAdmin !== true
    ) {
      throw new NotFoundException('Persona', params.personaId);
    }
    return params.brandId;
  }

  private async assertReferenceImages(params: {
    brandId: string;
    ingredientIds: readonly string[];
    organizationId: string;
  }): Promise<void> {
    const found = new Set(
      await findCharacterReferenceImageIds(this.prisma, params),
    );
    const missing = params.ingredientIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ValidationException(
        'Choose completed images from this brand',
        'ingredientIds',
        missing,
      );
    }
  }

  private async withPersonaLock<T>(
    params: PersonaReferenceScope,
    work: (
      tx: PersonaReferencesClient,
      persona: PersonaWithReferencesRow,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockPersona(tx, params.personaId);
      // Re-read under the lock so a concurrent edit cannot slip past.
      const persona = await this.materialize(
        tx,
        params.organizationId,
        await this.readPersona(tx, params.organizationId, params.personaId),
      );
      if (!persona) {
        throw new NotFoundException('Persona', params.personaId);
      }
      return work(tx, persona);
    });
  }

  private async lockPersona(
    tx: Pick<PersonaReferencesClient, '$queryRaw'>,
    personaId: string,
  ): Promise<void> {
    const key = `persona-references:${personaId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }

  private readPersona(
    client: Pick<PersonaReferencesClient, 'persona'>,
    organizationId: string,
    personaId: string,
  ): Promise<PersonaWithReferencesRow | null> {
    return client.persona.findFirst({
      select: PERSONA_WITH_REFERENCES_SELECT,
      where: scopedWhere(organizationId, { id: personaId }),
    });
  }

  /** Stores a legacy `avatarIngredientId`-only character's image as row 0. */
  private async materialize(
    client: PersonaReferencesClient,
    organizationId: string,
    persona: PersonaWithReferencesRow | null,
  ): Promise<PersonaWithReferencesRow | null> {
    if (
      !persona ||
      persona.references.length > 0 ||
      !persona.avatarIngredientId
    ) {
      return persona;
    }
    await client.personaReference.createMany({
      data: [
        {
          ingredientId: persona.avatarIngredientId,
          organizationId,
          personaId: persona.id,
          position: 0,
        },
      ],
      skipDuplicates: true,
    });
    return this.readPersona(client, organizationId, persona.id);
  }

  /** Stores `orderedIds` at positions 0..n-1, touching only moved rows. */
  private async writePositions(
    client: PersonaReferencesClient,
    organizationId: string,
    persona: { id: string; references: readonly PersonaReferenceRow[] },
    orderedIds: readonly string[],
  ): Promise<void> {
    const positions = new Map(
      persona.references.map((reference) => [
        reference.ingredientId,
        reference.position,
      ]),
    );
    for (const [position, ingredientId] of orderedIds.entries()) {
      if (positions.get(ingredientId) === position) {
        continue;
      }
      await client.personaReference.updateMany({
        data: { position },
        where: { ingredientId, organizationId, personaId: persona.id },
      });
    }
  }

  private async mirrorPrimary(
    client: PersonaReferencesClient,
    organizationId: string,
    persona: PersonaWithReferencesRow,
  ): Promise<string | null> {
    // Stored rows only: after a write a character with none has no primary.
    const [primary = null] = orderedReferenceIdsFromRow({
      avatarIngredientId: null,
      references: persona.references,
    });
    if (primary !== persona.avatarIngredientId) {
      await client.persona.update({
        data: { avatarIngredientId: primary },
        where: scopedWhere(organizationId, { id: persona.id }),
      });
    }
    return primary;
  }

  /**
   * Mirrors the primary and returns the new list. The legacy avatar was
   * already stored when the write took the lock, so it is not stored again:
   * removing the last reference leaves the character with none.
   */
  private async finishWrite(
    client: PersonaReferencesClient,
    organizationId: string,
    personaId: string,
  ): Promise<CharacterReferenceItem[]> {
    const persona = await this.readPersona(client, organizationId, personaId);
    if (!persona) {
      return [];
    }
    const primary = await this.mirrorPrimary(client, organizationId, persona);
    return toReferenceItems(
      orderedReferenceIdsFromRow({
        avatarIngredientId: primary,
        references: persona.references,
      }),
    );
  }
}

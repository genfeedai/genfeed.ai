import { randomUUID } from 'node:crypto';
import {
  type LibraryElementActor,
  LibraryElementsService,
} from '@api/collections/library-elements/services/library-elements.service';
import { resetLibraryElementSharingForRelocation } from '@api/collections/library-elements/utils/library-element-relocation.util';
import { PersonaGrantReadService } from '@api/collections/personas/services/persona-grant-read.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  IngredientCategory,
  IngredientStatus,
  LibraryElementType,
  PersonaAvailabilityMode,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

/**
 * Library elements against real Prisma and PostgreSQL (#7374): tenant
 * isolation, the handle namespace shared with characters, brand availability,
 * reference-file ownership and soft delete freeing the handle.
 */
describe.skipIf(!connectionString)(
  'LibraryElementsService PostgreSQL (#7374)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };
    const suffix = randomUUID().slice(0, 8);
    const id = (name: string) => `elements-${name}-${suffix}`;
    const userId = id('user');
    const orgA = id('org-a');
    const orgB = id('org-b');
    const brandA1 = id('brand-a1');
    const brandA2 = id('brand-a2');
    const brandB1 = id('brand-b1');
    const imageA1 = [id('img-a1-1'), id('img-a1-2'), id('img-a1-3')];
    const imageA2 = id('img-a2');

    let service: LibraryElementsService;

    const actor = (
      organizationId: string,
      brandId: string,
    ): LibraryElementActor => ({
      brandId,
      isSuperAdmin: true,
      organizationId,
      userId,
    });

    beforeAll(async () => {
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.organization.createMany({
        data: [orgA, orgB].map((orgId) => ({
          id: orgId,
          label: orgId,
          slug: orgId,
          userId,
        })),
      });
      await db.brand.createMany({
        data: [
          { id: brandA1, organizationId: orgA },
          { id: brandA2, organizationId: orgA },
          { id: brandB1, organizationId: orgB },
        ].map((brand) => ({
          ...brand,
          label: brand.id,
          slug: brand.id,
          userId,
        })),
      });
      await db.ingredient.createMany({
        data: [
          ...imageA1.map((imageId) => ({ brandId: brandA1, id: imageId })),
          { brandId: brandA2, id: imageA2 },
        ].map((image) => ({
          ...image,
          category: IngredientCategory.IMAGE,
          organizationId: orgA,
          status: IngredientStatus.GENERATED,
          userId,
        })),
      });
      const prismaService = db as unknown as PrismaService;
      service = new LibraryElementsService(
        prismaService,
        new PersonasService(
          prismaService,
          {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          } as unknown as LoggerService,
          new PersonaGrantReadService(prismaService),
        ),
      );
    });

    afterAll(async () => {
      if (!prisma) {
        return;
      }
      await prisma.libraryElement.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await prisma.persona.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await prisma.ingredient.deleteMany({ where: { userId } });
      await prisma.brand.deleteMany({ where: { userId } });
      await prisma.organization.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it('keeps reference files in order with the first as the cover', async () => {
      const created = await service.create(actor(orgA, brandA1), {
        handle: 'paris-loft',
        label: 'Paris loft',
        referenceIngredientIds: [imageA1[2], imageA1[0], imageA1[1]],
        type: LibraryElementType.LOCATION,
      });

      expect(created.referenceIngredientIds).toEqual([
        imageA1[2],
        imageA1[0],
        imageA1[1],
      ]);
      expect(created.coverIngredientId).toBe(imageA1[2]);

      const reordered = await service.update(actor(orgA, brandA1), created.id, {
        referenceIngredientIds: [imageA1[1]],
      });
      expect(reordered.referenceIngredientIds).toEqual([imageA1[1]]);
    });

    it('rejects a reference file that belongs to another brand', async () => {
      await expect(
        service.create(actor(orgA, brandA1), {
          handle: 'wrong-brand-file',
          label: 'Wrong brand file',
          referenceIngredientIds: [imageA2],
          type: LibraryElementType.PROP,
        }),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it('shares the handle namespace with characters of the same brand', async () => {
      await database().persona.create({
        data: {
          brandId: brandA1,
          handle: 'anna-shared',
          label: 'Anna',
          organizationId: orgA,
          userId,
        },
      });

      await expect(
        service.create(actor(orgA, brandA1), {
          handle: 'anna-shared',
          label: 'Anna the prop',
          type: LibraryElementType.PROP,
        }),
      ).rejects.toBeInstanceOf(ValidationException);

      const otherBrand = await service.create(actor(orgA, brandA2), {
        handle: 'anna-shared',
        label: 'Anna the prop',
        type: LibraryElementType.PROP,
      });
      expect(otherBrand.handle).toBe('anna-shared');
    });

    it('rejects a duplicate element handle in one brand and lets a rename keep its own', async () => {
      const first = await service.create(actor(orgA, brandA1), {
        handle: 'neon-style',
        label: 'Neon',
        type: LibraryElementType.STYLE,
      });
      await expect(
        service.create(actor(orgA, brandA1), {
          handle: 'neon-style',
          label: 'Neon again',
          type: LibraryElementType.STYLE,
        }),
      ).rejects.toBeInstanceOf(ValidationException);

      const renamed = await service.update(actor(orgA, brandA1), first.id, {
        handle: 'neon-style',
        label: 'Neon, renamed',
      });
      expect(renamed.label).toBe('Neon, renamed');
    });

    it('hides an element from another brand until it is shared', async () => {
      const element = await service.create(actor(orgA, brandA1), {
        handle: 'studio-set',
        label: 'Studio set',
        type: LibraryElementType.LOCATION,
      });

      await expect(
        service.findOne({ brandId: brandA2, organizationId: orgA }, element.id),
      ).rejects.toBeInstanceOf(NotFoundException);

      await service.update(actor(orgA, brandA1), element.id, {
        availability: { mode: PersonaAvailabilityMode.ALL_BRANDS },
      });
      const shared = await service.findOne(
        { brandId: brandA2, organizationId: orgA },
        element.id,
      );
      expect(shared.isShared).toBe(true);
    });

    it('stops sharing an element when its brand moves to another organization', async () => {
      const element = await service.create(actor(orgA, brandA1), {
        availability: { mode: PersonaAvailabilityMode.ALL_BRANDS },
        handle: 'moving-set',
        label: 'Moving set',
        type: LibraryElementType.LOCATION,
      });
      const otherBrand = { brandId: brandA2, organizationId: orgA };
      expect((await service.findOne(otherBrand, element.id)).isShared).toBe(
        true,
      );

      const reset = await resetLibraryElementSharingForRelocation(database(), {
        brandId: brandA1,
        organizationId: orgA,
      });

      expect(reset).toBeGreaterThanOrEqual(1);
      await expect(
        service.findOne(otherBrand, element.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        (await service.findOne(actor(orgA, brandA1), element.id)).isShared,
      ).toBe(false);
    });

    it('never reads, edits or deletes another organization element', async () => {
      const element = await service.create(actor(orgA, brandA1), {
        handle: 'tenant-prop',
        label: 'Tenant prop',
        type: LibraryElementType.PROP,
      });
      const outsider = actor(orgB, brandB1);

      await expect(
        service.findOne(outsider, element.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.update(outsider, element.id, { label: 'Taken over' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(outsider, element.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const listed = await service.list(outsider, {
        kind: undefined,
        limit: 50,
        page: 1,
        q: 'tenant-prop',
      });
      expect(listed.docs).toEqual([]);

      const untouched = await service.findOne(actor(orgA, brandA1), element.id);
      expect(untouched.label).toBe('Tenant prop');
    });

    it('removes an element from the list and frees its handle', async () => {
      const element = await service.create(actor(orgA, brandA1), {
        handle: 'short-lived',
        label: 'Short lived',
        type: LibraryElementType.PROP,
      });

      await service.remove(actor(orgA, brandA1), element.id);

      await expect(
        service.findOne(actor(orgA, brandA1), element.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      const listed = await service.list(actor(orgA, brandA1), {
        limit: 50,
        page: 1,
        q: 'short-lived',
      });
      expect(listed.docs).toEqual([]);

      const again = await service.create(actor(orgA, brandA1), {
        handle: 'short-lived',
        label: 'Short lived, again',
        type: LibraryElementType.PROP,
      });
      expect(again.id).not.toBe(element.id);
    });

    it('lists characters and elements together, filtered by kind', async () => {
      const all = await service.list(actor(orgA, brandA1), {
        limit: 50,
        page: 1,
        q: 'anna-shared',
      });
      expect(all.docs.map((row) => row.kind)).toEqual(['CHARACTER']);

      const props = await service.list(actor(orgA, brandA2), {
        kind: ['PROP'],
        limit: 50,
        page: 1,
        q: 'anna-shared',
      });
      expect(props.docs.map((row) => [row.kind, row.handle])).toEqual([
        ['PROP', 'anna-shared'],
      ]);
    });
  },
);

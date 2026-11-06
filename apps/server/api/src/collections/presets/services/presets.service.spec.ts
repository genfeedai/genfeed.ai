vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { PresetsService } from '@api/collections/presets/services/presets.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory } from '@genfeedai/contracts';
import { AD_PRESETS } from '@genfeedai/contracts/constants/ad-presets.constant';
import { B2B_PLAYBOOKS } from '@genfeedai/contracts/constants/b2b-playbooks.constant';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface Preset extends Row {
  config: Row;
  id: string;
  isDeleted: boolean;
  organizationId: string | null;
}

const ORG = 'organization-1';
const KEY = 'editorial-portrait';

const dto = (fields: Partial<CreatePresetDto>) => fields as CreatePresetDto;

// Prisma filters as Postgres applies them, including the JSON-path key filter.
const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Where[]).every((clause) => matches(row, clause));
    }
    if (key === 'OR') {
      return (condition as Where[]).some((clause) => matches(row, clause));
    }
    if (key === 'config') {
      const { equals, path } = condition as { equals: unknown; path: string[] };
      return (row.config as Row)[path[0] ?? ''] === equals;
    }
    if (condition && typeof condition === 'object' && 'not' in condition) {
      return row[key] !== condition.not;
    }
    return (row[key] ?? null) === condition;
  });

describe('PresetsService', () => {
  let rows: Preset[];
  let isUniqueIndexRace: boolean;
  let service: PresetsService;

  const row = (id: string) => rows.find((candidate) => candidate.id === id);
  const seed = (
    id: string,
    organizationId: string | null,
    config: Row = { key: KEY },
    fields: Row = {},
  ) => {
    rows.push({ config, id, isDeleted: false, organizationId, ...fields });
  };

  beforeEach(() => {
    rows = [];
    isUniqueIndexRace = false;

    const preset = {
      create: async ({ data }: { data: Row }) => {
        if (isUniqueIndexRace) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }
        const created = {
          id: `preset-${rows.length + 1}`,
          isDeleted: false,
          organizationId: null,
          ...structuredClone(data),
        } as Preset;
        rows.push(created);
        return structuredClone(created);
      },
      findFirst: async ({ where }: { where: Where }) => {
        const found = rows.find((candidate) => matches(candidate, where));
        return found ? structuredClone(found) : null;
      },
      update: async ({ data, where }: { data: Row; where: Where }) => {
        const found = rows.find((candidate) => matches(candidate, where));
        if (!found) {
          throw Object.assign(new Error('Record to update not found'), {
            code: 'P2025',
          });
        }
        return structuredClone(Object.assign(found, structuredClone(data)));
      },
    };

    service = new PresetsService(
      { preset } as unknown as PrismaService,
      {
        debug: () => undefined,
        error: () => undefined,
        log: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
    );
  });

  describe('create', () => {
    it('writes scalar scope fields and packs preset details into config', async () => {
      const created = await service.create(
        dto({
          adPreset: AD_PRESETS[0],
          aspectRatio: '4:5',
          brandId: 'brand-1',
          camera: 'close-up',
          cameraMovement: 'static',
          category: ModelCategory.IMAGE,
          description: 'Editorial portrait preset',
          duration: 8,
          key: KEY,
          label: 'Editorial Portrait',
          lens: '35mm',
          lighting: 'soft',
          organizationId: ORG,
          prompt: 'Editorial portrait with soft key light',
          promptTemplate: 'video-default',
        }),
      );

      expect(row(created.id)).toEqual({
        brandId: 'brand-1',
        category: ModelCategory.IMAGE,
        config: {
          adPreset: AD_PRESETS[0],
          aspectRatio: '4:5',
          camera: 'close-up',
          cameraMovement: 'static',
          description: 'Editorial portrait preset',
          duration: 8,
          key: KEY,
          label: 'Editorial Portrait',
          lens: '35mm',
          lighting: 'soft',
          prompt: 'Editorial portrait with soft key light',
          promptTemplate: 'video-default',
        },
        id: created.id,
        isDeleted: false,
        organizationId: ORG,
      });
    });

    it.each([
      ['a platform default', null, undefined],
      ['an organization preset', ORG, ORG],
    ])(
      'rejects a key already used by %s in the same scope',
      async (_case, existingOrg, newOrg) => {
        seed('existing', existingOrg);

        await expect(
          service.create(dto({ key: KEY, organizationId: newOrg })),
        ).rejects.toEqual(
          new ConflictException(`Preset with key '${KEY}' already exists`),
        );
        expect(rows.map(({ id }) => id)).toEqual(['existing']);
      },
    );

    it.each([
      ['a platform default', null, { isDeleted: false }],
      ['another organization', 'organization-2', { isDeleted: false }],
      ['a deleted preset of the organization', ORG, { isDeleted: true }],
    ])(
      'lets an organization reuse a key held by %s',
      async (_case, existingOrg, fields) => {
        seed('existing', existingOrg, { key: KEY }, fields);

        const created = await service.create(
          dto({ key: KEY, organizationId: ORG }),
        );

        expect(row(created.id)).toMatchObject({
          config: { key: KEY },
          organizationId: ORG,
        });
      },
    );

    it('reports a unique-index race as the same key conflict', async () => {
      isUniqueIndexRace = true;

      await expect(
        service.create(dto({ key: KEY, organizationId: ORG })),
      ).rejects.toEqual(
        new ConflictException(`Preset with key '${KEY}' already exists`),
      );
      expect(rows).toEqual([]);
    });
  });

  describe('findByKey', () => {
    it('resolves a key in the caller organization before platform defaults', async () => {
      seed('default', null);
      seed('own', ORG);

      await expect(service.findByKey(KEY, ORG)).resolves.toMatchObject({
        id: 'own',
      });
    });

    it('falls back to the platform default', async () => {
      seed('default', null);

      await expect(service.findByKey(KEY, ORG)).resolves.toMatchObject({
        id: 'default',
      });
    });

    it('never returns a key owned by another organization', async () => {
      seed('foreign', 'organization-2');

      await expect(service.findByKey(KEY, ORG)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws when neither scope has the key', async () => {
      await expect(service.findByKey('missing', ORG)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('patch', () => {
    it('merges config-backed updates without dropping stored preset details', async () => {
      seed('preset-1', ORG, {
        key: KEY,
        label: 'Editorial Portrait',
        prompt: 'Old prompt',
      });

      await service.patch('preset-1', {
        aspectRatio: '9:16',
        label: 'Updated Editorial Portrait',
        style: '',
      });

      expect(row('preset-1')?.config).toEqual({
        aspectRatio: '9:16',
        key: KEY,
        label: 'Updated Editorial Portrait',
        prompt: 'Old prompt',
        style: '',
      });
    });

    it('removes a stored setting that an update clears with null', async () => {
      seed('preset-1', ORG, {
        duration: 5,
        key: 'studio-animation',
        label: 'Animation',
      });

      await service.patch('preset-1', { duration: null, label: 'Animation' });

      expect(row('preset-1')?.config).toEqual({
        key: 'studio-animation',
        label: 'Animation',
      });
    });

    it('refuses to rename a key onto another preset of the organization', async () => {
      seed('preset-1', ORG, { key: 'first' });
      seed('preset-2', ORG, { key: 'second' });

      await expect(
        service.patch('preset-1', { key: 'second' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(row('preset-1')?.config).toEqual({ key: 'first' });
    });

    it('keeps its own key when other settings change', async () => {
      seed('preset-1', ORG, { key: KEY, label: 'Old' });

      await service.patch('preset-1', { key: KEY, label: 'New' });

      expect(row('preset-1')?.config).toEqual({ key: KEY, label: 'New' });
    });
  });

  describe('playbook', () => {
    it('stores a valid playbook in config so an admin can edit it live', async () => {
      const created = await service.create(
        dto({ key: B2B_PLAYBOOKS[0].key, playbook: B2B_PLAYBOOKS[0] }),
      );

      expect(row(created.id)?.config).toEqual({
        key: B2B_PLAYBOOKS[0].key,
        playbook: B2B_PLAYBOOKS[0],
      });
    });

    it('rejects a malformed playbook on create and writes nothing', async () => {
      await expect(
        service.create(
          dto({
            key: 'broken',
            playbook: { ...B2B_PLAYBOOKS[0], shots: [] },
          }),
        ),
      ).rejects.toThrow(/Invalid playbook: shots/);
      expect(rows).toEqual([]);
    });

    it('rejects a malformed playbook on update and leaves the row alone', async () => {
      seed('preset-1', ORG, {
        key: B2B_PLAYBOOKS[0].key,
        playbook: B2B_PLAYBOOKS[0],
      });

      await expect(
        service.patch('preset-1', {
          playbook: { ...B2B_PLAYBOOKS[0], allowedModels: [] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(row('preset-1')?.config).toEqual({
        key: B2B_PLAYBOOKS[0].key,
        playbook: B2B_PLAYBOOKS[0],
      });
    });

    it('replaces a stored playbook with the edited one and keeps the rest', async () => {
      seed('preset-1', ORG, {
        key: B2B_PLAYBOOKS[0].key,
        playbook: B2B_PLAYBOOKS[0],
      });
      const edited = { ...B2B_PLAYBOOKS[0], hookFormula: 'Lead with proof.' };

      await service.patch('preset-1', { playbook: edited });

      expect(row('preset-1')?.config).toEqual({
        key: B2B_PLAYBOOKS[0].key,
        playbook: edited,
      });
    });
  });
});

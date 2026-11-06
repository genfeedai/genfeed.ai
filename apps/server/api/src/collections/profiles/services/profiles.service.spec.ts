import type { ModelsService } from '@api/collections/models/services/models.service';
import type { AnalyzeToneDto } from '@api/collections/profiles/dto/analyze-tone.dto';
import type { ApplyProfileDto } from '@api/collections/profiles/dto/apply-profile.dto';
import type { GenerateFromExamplesDto } from '@api/collections/profiles/dto/generate-from-examples.dto';
import { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma, Profile } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { beforeEach, describe, expect, it } from 'vitest';

type Where = Record<string, unknown>;

interface StructuredRequest {
  input: Record<string, unknown>;
  onAttempt: (input: Record<string, unknown>, output: string) => Promise<void>;
  schemaName: string;
}

const ORG = 'org-1';
const CREATED_AT = new Date('2026-09-01T10:00:00Z');
const ORG_KEY = 'org-openrouter-key';

// Prisma filters on the profile table, including its JSON-path `data` filter.
const matches = (row: Profile, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'data') {
      const { equals, path } = condition as { equals: unknown; path: string[] };
      return (row.data as Record<string, unknown>)[path[0] ?? ''] === equals;
    }
    if (condition && typeof condition === 'object' && 'not' in condition) {
      return row[key as keyof Profile] !== condition.not;
    }
    return row[key as keyof Profile] === condition;
  });

describe('ProfilesService', () => {
  let rows: Profile[];
  let charges: number[];
  let service: ProfilesService;

  const seed = (
    id: string,
    data: Prisma.JsonObject,
    fields: Partial<Profile> = {},
  ) => {
    rows.push({
      createdAt: CREATED_AT,
      createdById: 'creator-1',
      data,
      id,
      isDeleted: false,
      organizationId: ORG,
      updatedAt: CREATED_AT,
      ...fields,
    });
  };
  const row = (id: string) => rows.find((candidate) => candidate.id === id);
  const inTenant = <T>(work: () => Promise<T>) =>
    runWithTenantContext({ organizationId: ORG }, work);

  beforeEach(() => {
    rows = [];
    charges = [];

    // Every query passes the real CLOUD tenant guard, as in production.
    const guarded =
      <TArgs, TResult>(operation: string, run: (args: TArgs) => TResult) =>
      async (args: TArgs) => {
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'Profile',
          operation,
          tenantModelNames: new Set(['Profile']),
        });
        return run(args);
      };
    const profile = {
      create: guarded('create', ({ data }: { data: Partial<Profile> }) => {
        const created = {
          createdAt: CREATED_AT,
          createdById: null,
          id: `profile-${rows.length + 1}`,
          isDeleted: false,
          updatedAt: CREATED_AT,
          ...data,
        } as Profile;
        rows.push(created);
        return { ...created };
      }),
      findFirst: guarded('findFirst', ({ where }: { where: Where }) => {
        const found = rows.find((candidate) => matches(candidate, where));
        return found ? { ...found } : null;
      }),
      findMany: guarded('findMany', ({ where }: { where: Where }) =>
        rows.filter((candidate) => matches(candidate, where)),
      ),
      update: guarded(
        'update',
        ({ data, where }: { data: Partial<Profile>; where: Where }) => {
          const found = rows.find((candidate) => matches(candidate, where));
          if (!found) throw new Error('Record to update not found');
          return { ...Object.assign(found, data) };
        },
      ),
      updateMany: guarded(
        'updateMany',
        ({ data, where }: { data: Partial<Profile>; where: Where }) => {
          const changed = rows.filter((candidate) => matches(candidate, where));
          for (const candidate of changed) Object.assign(candidate, data);
          return { count: changed.length };
        },
      ),
    };

    // The text model answers in the name of whichever key paid for it.
    const replicate = {
      generateStructuredTextSync: async (
        _model: string,
        request: StructuredRequest,
        apiKey?: string,
      ) => {
        const paidBy = apiKey ?? 'platform';
        const answer = request.schemaName.includes('tone')
          ? { score: 82, summary: `Checked on ${paidBy}`, violations: [] }
          : {
              article: { writingStyle: `Learned on ${paidBy}` },
              image: null,
              video: null,
              voice: null,
            };
        await request.onAttempt(request.input, JSON.stringify(answer));
        return answer;
      },
      generateTextCompletionSync: async (
        _model: string,
        _input: Record<string, unknown>,
        apiKey?: string,
      ) => `Enhanced on ${apiKey ?? 'platform'}`,
    };

    service = new ProfilesService(
      { profile } as unknown as PrismaService,
      {
        debug: () => undefined,
        error: () => undefined,
      } as unknown as LoggerService,
      {
        findOne: async () => ({ cost: 1, pricingType: 'flat' }),
      } as unknown as ModelsService,
      replicate as unknown as ReplicateService,
    );
  });

  describe('findOne', () => {
    it('projects profile data while keeping the canonical row fields', async () => {
      const data = {
        createdAt: 'forged-date',
        createdById: 'forged-creator',
        id: 'forged-id',
        isDeleted: true,
        label: 'Editorial voice',
        organizationId: 'forged-org',
        tags: ['editorial'],
        updatedAt: 'forged-date',
      };
      seed('profile-1', data);

      const result = await service.findOne('profile-1', ORG);

      expect(result).toMatchObject({
        createdAt: CREATED_AT,
        createdById: 'creator-1',
        id: 'profile-1',
        isDeleted: false,
        label: 'Editorial voice',
        organizationId: ORG,
        tags: ['editorial'],
        updatedAt: CREATED_AT,
      });
      expect(result.data).toEqual(data);
    });

    it.each([
      ['another organization', { organizationId: 'org-2' }],
      ['a deleted profile', { isDeleted: true }],
    ])('does not find %s', async (_case, fields) => {
      seed('profile-1', { label: 'Voice' }, fields);

      await expect(service.findOne('profile-1', ORG)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('tenant-scoped writes', () => {
    beforeEach(() => {
      seed('profile-1', { isDefault: false, label: 'Voice' });
      seed('profile-2', { isDefault: true, label: 'Old default' });
      seed('foreign', { isDefault: true }, { organizationId: 'org-2' });
    });

    it('makes a profile the only default of its organization', async () => {
      await inTenant(() =>
        service.update('profile-1', { isDefault: true }, ORG),
      );

      expect(rows.map(({ data, id }) => [id, data])).toEqual([
        ['profile-1', { isDefault: true, label: 'Voice' }],
        ['profile-2', { isDefault: false, label: 'Old default' }],
        ['foreign', { isDefault: true }],
      ]);
    });

    it('soft-deletes a profile of the request organization', async () => {
      await inTenant(() => service.remove('profile-2', ORG));

      expect(row('profile-2')?.isDeleted).toBe(true);
      await expect(service.findAll(ORG)).resolves.toEqual([
        expect.objectContaining({ id: 'profile-1' }),
      ]);
    });

    it('refuses to delete a profile of another organization', async () => {
      await expect(
        inTenant(() => service.remove('foreign', ORG)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(row('foreign')?.isDeleted).toBe(false);
    });
  });

  // #5375: BYOK — the resolved org key (when the CreditsGuard granted a
  // bypass) must reach the actual text-completion dispatch, not just the
  // credit decision.
  describe('BYOK threading (#5375)', () => {
    const applyDto: ApplyProfileDto = {
      contentType: 'article',
      profileId: 'profile-1',
      prompt: 'test',
    };
    const toneDto: AnalyzeToneDto = {
      content: 'content',
      contentType: 'article',
      profileId: 'profile-1',
    };
    const examplesDto: GenerateFromExamplesDto = {
      description: 'From examples',
      examples: [{ content: 'example', contentType: 'article' }],
      label: 'Generated',
    };
    const bill = (amount: number) => {
      charges.push(amount);
    };

    beforeEach(() => {
      seed('profile-1', {
        article: { writingStyle: 'formal' },
        usageCount: 0,
      });
    });

    it.each([
      [ORG_KEY, 'Enhanced on org-openrouter-key'],
      [undefined, 'Enhanced on platform'],
    ])(
      'enhances a prompt on the resolved key (%s)',
      async (apiKey, enhanced) => {
        await expect(
          service.applyProfile(applyDto, ORG, bill, apiKey),
        ).resolves.toMatchObject({ enhanced, original: 'test' });
        expect(row('profile-1')?.data).toMatchObject({ usageCount: 1 });
        expect(charges).toHaveLength(1);
      },
    );

    it('analyzes tone on the resolved key', async () => {
      await expect(
        service.analyzeTone(toneDto, ORG, bill, ORG_KEY),
      ).resolves.toEqual({
        score: 82,
        summary: 'Checked on org-openrouter-key',
        violations: [],
      });
      expect(charges).toHaveLength(1);
    });

    it('learns a new profile from examples on the resolved key', async () => {
      const created = await service.generateFromExamples(
        examplesDto,
        ORG,
        'user-1',
        bill,
        ORG_KEY,
      );

      expect(row(created.id)).toMatchObject({
        createdById: 'user-1',
        data: {
          article: { writingStyle: 'Learned on org-openrouter-key' },
          description: 'From examples',
          label: 'Generated',
        },
        organizationId: ORG,
      });
      expect(charges).toHaveLength(1);
    });
  });
});

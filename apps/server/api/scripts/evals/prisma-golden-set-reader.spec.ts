import {
  ContentFormat,
  PostCategory,
  PostFormat,
  ReviewDecision,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { READER_PAGE_SIZE } from './golden-set.constants';
import type {
  GoldenBrandRecord,
  GoldenBrandSelect,
  GoldenCredentialRecord,
  GoldenCredentialSelect,
  GoldenFindManyArgs,
  GoldenMemberRecord,
  GoldenMemberSelect,
  GoldenOrganizationFindFirstArgs,
  GoldenScopedRecord,
  GoldenSelectedFindManyArgs,
  GoldenSetPrismaClient,
  GoldenSetScope,
  GoldenSetWindow,
} from './golden-set.types';
import { PrismaGoldenSetReader } from './prisma-golden-set-reader';

type RecordedCall = { table: string; args: GoldenFindManyArgs };
const scope: GoldenSetScope = {
  organizationId: 'invented-org',
  brandIds: ['invented-brand'],
};
const window: GoldenSetWindow = {
  from: new Date('2026-01-01'),
  to: new Date('2026-02-01'),
};
const base = {
  id: 'record',
  organizationId: scope.organizationId,
  isDeleted: false,
  createdAt: window.from,
};
class FakeGoldenSetPrismaClient implements GoldenSetPrismaClient {
  readonly calls: RecordedCall[] = [];
  readonly organizationCalls: GoldenOrganizationFindFirstArgs[] = [];
  readonly brandCalls: GoldenSelectedFindManyArgs<GoldenBrandSelect>[] = [];
  readonly credentialCalls: GoldenSelectedFindManyArgs<GoldenCredentialSelect>[] =
    [];
  readonly memberCalls: GoldenSelectedFindManyArgs<GoldenMemberSelect>[] = [];
  readonly organization = {
    findFirst: async (args: GoldenOrganizationFindFirstArgs) => {
      this.organizationCalls.push(args);
      return {
        id: scope.organizationId,
        label: 'Invented Org',
        slug: 'invented-org',
      };
    },
  };
  readonly brand = {
    findMany: async (
      args: GoldenSelectedFindManyArgs<GoldenBrandSelect>,
    ): Promise<GoldenBrandRecord[]> => {
      this.calls.push({ table: 'brand', args });
      this.brandCalls.push(args);
      return [
        {
          id: 'invented-brand',
          label: 'Invented Brand',
          slug: 'invented-brand',
        },
      ];
    },
  };
  readonly credential = {
    findMany: async (
      args: GoldenSelectedFindManyArgs<GoldenCredentialSelect>,
    ): Promise<GoldenCredentialRecord[]> => {
      this.calls.push({ table: 'credential', args });
      this.credentialCalls.push(args);
      return [
        {
          brandId: 'invented-brand',
          externalHandle: '@invented_studio',
          externalName: null,
          username: null,
        },
      ];
    },
  };
  readonly member = {
    findMany: async (
      args: GoldenSelectedFindManyArgs<GoldenMemberSelect>,
    ): Promise<GoldenMemberRecord[]> => {
      this.calls.push({ table: 'member', args });
      this.memberCalls.push(args);
      return [
        {
          user: {
            firstName: 'Mara',
            lastName: 'Lindqvist',
            name: null,
            handle: 'mara_lindqvist',
          },
        },
      ];
    },
  };
  readonly post = this.delegate('post', {
    ...base,
    brandId: 'invented-brand',
    parentId: null,
    order: 0,
    format: PostFormat.THREAD,
    category: PostCategory.TEXT,
    description: 'Invented text',
    promptUsed: null,
    platform: null,
    reviewDecision: ReviewDecision.APPROVED,
    reviewEvents: [],
  });
  readonly batchItem = this.delegate('batchItem', {
    ...base,
    brandId: 'invented-brand',
    reviewDecision: ReviewDecision.APPROVED,
    data: {
      format: ContentFormat.IMAGE,
      caption: 'Invented caption',
      postId: 'linked-post',
    },
  });
  readonly evaluation = this.delegate('evaluation', {
    ...base,
    contentType: 'article',
    contentId: 'linked-article',
    data: {},
  });
  readonly article = this.delegate('article', {
    ...base,
    brandId: 'invented-brand',
    content: 'Invented article',
    summary: null,
  });
  readonly newsletter = this.delegate('newsletter', {
    ...base,
    brandId: 'invented-brand',
    content: 'Invented newsletter',
    summary: null,
    generationPrompt: null,
    approvedAt: window.from,
    approvedByUserId: 'invented-user',
  });
  readonly profile = this.delegate('profile', {
    ...base,
    data: {
      brandId: 'invented-brand',
      profileType: 'harness',
      examples: {
        avoid: ['Invented old', 'Invented late', 'Invented curated'],
      },
      avoidFeedback: [
        {
          source: 'post:avoid-post',
          content: 'Invented avoid',
          addedAt: '2026-01-01',
        },
        {
          source: 'batch_item:avoid-batch',
          content: 'Invented avoid',
          addedAt: '2026-01-15',
        },
        {
          source: 'newsletter:avoid-newsletter',
          content: 'Invented avoid',
          addedAt: '2026-01-31',
        },
        {
          source: 'post:old-post',
          content: 'Invented old',
          addedAt: '2025-12-31',
        },
        {
          source: 'post:late-post',
          content: 'Invented late',
          addedAt: '2026-02-01',
        },
      ],
    },
  });
  readonly contextBase = this.delegate('contextBase', {
    ...base,
    data: { brandId: 'invented-brand', purpose: 'harness-performance-winners' },
  });
  readonly contextEntry = this.delegate('contextEntry', {
    ...base,
    contextBaseId: 'record-0000',
    data: {
      content: 'Winning post: Invented winner',
      metadata: { postId: 'winner-post' },
    },
  });
  private delegate<TRow extends GoldenScopedRecord>(table: string, row: TRow) {
    return {
      findMany: async (args: GoldenFindManyArgs): Promise<TRow[]> => {
        this.calls.push({ table, args });
        if (args.where.OR) return [];
        return Array.from({ length: READER_PAGE_SIZE }, (_, index) => ({
          ...row,
          id: `record-${String(index).padStart(4, '0')}`,
        }));
      },
    };
  }
}
describe('tenant-scoped reader', () => {
  it('scopes and orders every query, paginates content, and reads context once with exact selects', async () => {
    const client = new FakeGoldenSetPrismaClient();
    const result = await new PrismaGoldenSetReader(client).readScope(
      scope,
      window,
    );
    expect(client.organizationCalls).toEqual([
      {
        where: { id: scope.organizationId, isDeleted: false },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    ]);
    for (const call of client.calls) {
      expect(call.args.where.organizationId).toBe(scope.organizationId);
      expect(call.args.where.isDeleted).toBe(false);
      expect(call.args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
      if (['brand', 'credential', 'member'].includes(call.table)) {
        expect(call.args.take).toBeUndefined();
        expect(call.args.where.OR).toBeUndefined();
      } else {
        expect(call.args.take).toBe(READER_PAGE_SIZE);
        if (call.args.where.OR)
          expect(call.args.where.OR).toEqual([
            { createdAt: { gt: window.from } },
            { createdAt: window.from, id: { gt: 'record-0499' } },
          ]);
      }
    }
    expect(client.calls.filter((call) => call.args.where.OR)).toHaveLength(12);
    expect(client.brandCalls).toHaveLength(1);
    expect(client.credentialCalls).toHaveLength(1);
    expect(client.memberCalls).toHaveLength(1);
    expect(client.brandCalls[0]?.select).toEqual({
      id: true,
      label: true,
      slug: true,
    });
    expect(client.credentialCalls[0]?.select).toEqual({
      brandId: true,
      externalHandle: true,
      externalName: true,
      username: true,
    });
    expect(client.memberCalls[0]?.select).toEqual({
      user: {
        select: { firstName: true, lastName: true, name: true, handle: true },
      },
    });
    expect(result.posts).toHaveLength(500);
    expect(result.linkedArticles).toHaveLength(500);
  });
  it('applies primary brand filters and half-open windows, while linked lookups ignore the window', async () => {
    const client = new FakeGoldenSetPrismaClient();
    const result = await new PrismaGoldenSetReader(client).readScope(
      scope,
      window,
    );
    const firstPages = client.calls.filter(
      (call) => call.args.take && !call.args.where.OR,
    );
    for (const call of firstPages) {
      if (call.args.where.createdAt)
        expect(call.args.where.createdAt).toEqual({
          gte: window.from,
          lt: window.to,
        });
      if (
        ['post', 'batchItem', 'newsletter'].includes(call.table) &&
        call.args.where.createdAt
      )
        expect(call.args.where.brandId).toEqual({ in: scope.brandIds });
      if (
        call.args.where.id ||
        (call.table === 'post' && call.args.where.parentId !== null)
      ) {
        expect(call.args.where.createdAt).toBeUndefined();
        expect(call.args.where.brandId).toBeUndefined();
      }
    }
    expect(
      firstPages.find((call) => call.table === 'evaluation')?.args.where
        .contentType,
    ).toEqual({ in: ['post', 'article'] });
    expect(
      firstPages.find((call) => call.table === 'profile')?.args.where.data,
    ).toEqual({ path: ['profileType'], equals: 'harness' });
    expect(
      firstPages.find((call) => call.table === 'contextBase')?.args.where.data,
    ).toEqual({ path: ['purpose'], equals: 'harness-performance-winners' });
    expect(client.credentialCalls[0]?.where.brandId).toEqual({
      in: ['invented-brand'],
    });
    expect(result.profiles[0]?.data).toMatchObject({
      examples: { avoid: ['Invented curated'] },
      avoidFeedback: [
        { source: 'post:avoid-post' },
        { source: 'batch_item:avoid-batch' },
        { source: 'newsletter:avoid-newsletter' },
      ],
    });
    const linkedPostCall = firstPages.find(
      (call) => call.table === 'post' && call.args.where.id,
    );
    expect(linkedPostCall?.args.where.id).toEqual({
      in: ['avoid-post', 'linked-post', 'winner-post'],
    });
    expect(
      firstPages.find((call) => call.table === 'article')?.args.where.id,
    ).toEqual({ in: ['linked-article'] });
    expect(
      firstPages.find(
        (call) => call.table === 'batchItem' && call.args.where.id,
      )?.args.where.id,
    ).toEqual({ in: ['avoid-batch'] });
    expect(
      firstPages.find(
        (call) => call.table === 'newsletter' && call.args.where.id,
      )?.args.where.id,
    ).toEqual({ in: ['avoid-newsletter'] });
  });
  it('omits primary brand filters for an all-brands scope', async () => {
    const client = new FakeGoldenSetPrismaClient();
    await new PrismaGoldenSetReader(client).readScope(
      { ...scope, brandIds: [] },
      window,
    );
    for (const call of client.calls.filter((call) =>
      ['post', 'batchItem', 'newsletter'].includes(call.table),
    ))
      expect(call.args.where.brandId).toBeUndefined();
  });
});

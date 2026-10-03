import { PrismaClient } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { createPrismaPgConfig } from '@libs/prisma/prisma-pg-config';
import { PrismaPg } from '@prisma/adapter-pg';
import type {
  GoldenFindManyArgs,
  GoldenSetPrismaClient,
  GoldenSetRecordWhere,
  GoldenStringFilter,
} from './golden-set.types';

function idFilter(value: string | GoldenStringFilter | undefined) {
  return typeof value === 'string' || value === undefined
    ? value
    : { in: value.in, gt: value.gt };
}
function dateFilter(value: GoldenSetRecordWhere['createdAt']) {
  return value instanceof Date || value === undefined
    ? value
    : { gte: value.gte, lt: value.lt, gt: value.gt };
}
function common(args: GoldenFindManyArgs) {
  return {
    orderBy: args.orderBy.map((order) => ({
      createdAt: order.createdAt,
      id: order.id,
    })),
    take: args.take,
    where: {
      organizationId: args.where.organizationId,
      isDeleted: false as const,
      id: idFilter(args.where.id),
      createdAt: dateFilter(args.where.createdAt),
      OR: args.where.OR?.map((cursor) => ({
        createdAt: dateFilter(cursor.createdAt),
        id: idFilter(cursor.id),
      })),
    },
  };
}
export function createGoldenSetDatabaseClient() {
  const config = new ConfigService();
  const connectionString = config.get('DATABASE_URL');
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      createPrismaPgConfig(connectionString, {
        caFilePaths: [
          config.get('PRISMA_POSTGRES_CA_FILE'),
          config.get('PGSSLROOTCERT'),
        ],
      }),
    ),
    log: ['error'],
  });
  const client: GoldenSetPrismaClient = {
    organization: {
      findFirst: (args) =>
        prisma.organization.findFirst({
          where: args.where,
          orderBy: args.orderBy.map((order) => ({
            createdAt: order.createdAt,
            id: order.id,
          })),
        }),
    },
    brand: {
      findMany: (args) =>
        prisma.brand.findMany({ ...common(args), select: args.select }),
    },
    credential: {
      findMany: (args) =>
        prisma.credential.findMany({
          ...common(args),
          where: { ...common(args).where, brandId: args.where.brandId },
          select: args.select,
        }),
    },
    member: {
      findMany: (args) =>
        prisma.member.findMany({ ...common(args), select: args.select }),
    },
    post: {
      findMany: (args) =>
        prisma.post.findMany({
          ...common(args),
          where: {
            ...common(args).where,
            brandId: idFilter(args.where.brandId),
            parentId: args.where.parentId,
            ...(args.where.reviewDecision
              ? { reviewDecision: { not: null } }
              : {}),
          },
        }),
    },
    batchItem: {
      findMany: (args) =>
        prisma.batchItem.findMany({
          ...common(args),
          where: {
            ...common(args).where,
            brandId: args.where.brandId,
            ...(args.where.reviewDecision
              ? { reviewDecision: { not: null } }
              : {}),
          },
        }),
    },
    evaluation: {
      findMany: (args) =>
        prisma.evaluation.findMany({
          ...common(args),
          where: { ...common(args).where, contentType: args.where.contentType },
        }),
    },
    article: { findMany: (args) => prisma.article.findMany(common(args)) },
    newsletter: {
      findMany: (args) =>
        prisma.newsletter.findMany({
          ...common(args),
          where: {
            ...common(args).where,
            brandId: args.where.brandId,
            approvedAt: args.where.approvedAt,
            approvedByUserId: args.where.approvedByUserId,
          },
        }),
    },
    profile: {
      findMany: (args) =>
        prisma.profile.findMany({
          ...common(args),
          where: { ...common(args).where, data: args.where.data },
        }),
    },
    contextBase: {
      findMany: (args) =>
        prisma.contextBase.findMany({
          ...common(args),
          where: { ...common(args).where, data: args.where.data },
        }),
    },
    contextEntry: {
      findMany: (args) =>
        prisma.contextEntry.findMany({
          ...common(args),
          where: {
            ...common(args).where,
            contextBaseId: idFilter(args.where.contextBaseId),
          },
        }),
    },
  };
  return { client, disconnect: () => prisma.$disconnect() };
}

import { randomBytes } from 'node:crypto';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

function passedReport(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'status' in value &&
    value.status === 'passed' &&
    'synthetic' in value &&
    value.synthetic === false
  );
}
@Injectable()
export class LearningReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async create(input: {
    actorId: string;
    artifactIds: string[];
    reportId: string;
    requestId: string;
    organizationId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
      const report = await tx.contentLearningRun.findFirst({
        where: {
          id: input.reportId,
          type: 'evaluate',
          status: 'completed',
          isDeleted: false,
        },
      });
      if (!report)
        throw new BadRequestException(
          'Completed immutable evaluation required',
        );
      const artifacts = await tx.contentLearningSharedPolicy.findMany({
        where: { id: { in: input.artifactIds }, isDeleted: false },
      });
      if (
        artifacts.length !== input.artifactIds.length ||
        artifacts.some((row) => row.validity === 'invalid') ||
        !(await this.dependencies.valid('run', report.id, tx, null))
      )
        throw new BadRequestException('Invalid artifact manifest');
      const payloadHash = learningHash([
        input.artifactIds.slice().sort(),
        input.reportId,
      ]);
      const prior = await tx.contentLearningOperation.findFirst({
        where: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          scope: 'global-admin',
          requestId: input.requestId,
          isDeleted: false,
        },
      });
      if (prior) {
        if (prior.payloadHash !== payloadHash)
          throw new ConflictException('Release idempotency payload conflict');
        return prior;
      }
      const release = await tx.contentLearningRelease.create({
        data: {
          manifest: toPrismaJson(
            artifacts.map((row) => ({
              cell: row.cell,
              policyId: row.id,
              version: row.version,
            })),
          ),
          reviewId: input.actorId,
          reportId: report.id,
          recipientSalt: randomBytes(32).toString('hex'),
          synthetic: report.synthetic || artifacts.some((row) => row.synthetic),
        },
      });
      await this.dependencies.link(
        tx,
        await this.dependencies.resolve('run', report.id, null, tx),
        await this.dependencies.resolve('release', release.id, null, tx),
      );
      for (const artifact of artifacts)
        await this.dependencies.link(
          tx,
          await this.dependencies.resolve(
            'shared-policy',
            artifact.id,
            null,
            tx,
          ),
          await this.dependencies.resolve('release', release.id, null, tx),
        );
      return tx.contentLearningOperation.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          scope: 'global-admin',
          requestId: input.requestId,
          payloadHash,
          type: 'release-create',
          status: 'completed',
          resultReferences: toPrismaJson({ releaseId: release.id }),
        },
      });
    });
  }
  async control(input: {
    actorId: string;
    organizationId: string;
    id: string;
    action: string;
    expectedRevision: number;
    requestId: string;
    reason: string;
  }) {
    const payloadHash = learningHash(input);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM content_learning_releases WHERE "isDeleted" = false ORDER BY id FOR UPDATE`;
        const prior = await tx.contentLearningOperation.findFirst({
          where: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            scope: 'global-admin',
            requestId: input.requestId,
            isDeleted: false,
          },
        });
        if (prior) {
          if (prior.payloadHash !== payloadHash)
            throw new ConflictException('Release request key conflict');
          return prior;
        }
        const release = await tx.contentLearningRelease.findFirst({
          where: { id: input.id, isDeleted: false },
        });
        if (!release) throw new BadRequestException('Release unavailable');
        if (release.revision !== input.expectedRevision)
          throw new ConflictException({
            reason: 'revision_conflict',
            currentRevision: release.revision,
          });
        const report = await tx.contentLearningRun.findFirst({
          where: { id: release.reportId, isDeleted: false },
        });
        const transitions: Record<string, string> = {
          canary: 'canary',
          limited: 'limited',
          stable: 'stable',
          pause: 'paused',
          rollback: 'retired',
        };
        const stage = transitions[input.action];
        if (!stage)
          throw new BadRequestException('Unsupported release control');
        if (!['pause', 'rollback'].includes(input.action)) {
          if (
            release.synthetic ||
            !passedReport(report?.report) ||
            !(await this.dependencies.valid('release', release.id, tx, null))
          )
            throw new ConflictException(
              'Promotion requires passed real evaluation and valid consent dependencies',
            );
          const allowed: Record<string, string> = {
            canary: 'candidate',
            limited: 'canary',
            stable: 'limited',
          };
          if (release.stage !== allowed[input.action])
            throw new ConflictException('Invalid stage transition');
          if (
            input.action !== 'canary' &&
            (!release.stageStartedAt ||
              Date.now() - release.stageStartedAt.getTime() < 7 * 86400000)
          )
            throw new ConflictException(
              'Stage requires seven days of randomized online evidence',
            );
          if (
            input.action !== 'canary' &&
            !(
              report?.report &&
              typeof report.report === 'object' &&
              !Array.isArray(report.report) &&
              'onlineGatePassed' in report.report &&
              report.report.onlineGatePassed === true
            )
          )
            throw new ConflictException(
              'Prespecified randomized online gate is inconclusive',
            );
        }
        const manifest = Array.isArray(release.manifest)
          ? release.manifest
          : [];
        const cells = manifest.flatMap((row) =>
          row &&
          typeof row === 'object' &&
          !Array.isArray(row) &&
          'cell' in row &&
          typeof row.cell === 'string'
            ? [row.cell]
            : [],
        );
        if (!['pause', 'rollback'].includes(input.action))
          await tx.contentLearningRelease.updateMany({
            where: {
              id: { not: release.id },
              stage,
              activeCells: { hasSome: cells },
              isDeleted: false,
            },
            data: {
              activeCells: [],
              stage: 'retired',
              revision: { increment: 1 },
            },
          });
        await tx.contentLearningRelease.updateMany({
          where: {
            id: release.id,
            revision: release.revision,
            isDeleted: false,
          },
          data: {
            stage,
            revision: { increment: 1 },
            stageStartedAt: new Date(),
            activeCells: ['pause', 'rollback'].includes(input.action)
              ? []
              : cells,
          },
        });
        if (
          input.action === 'rollback' &&
          release.priorReleaseId &&
          (await this.dependencies.valid(
            'release',
            release.priorReleaseId,
            tx,
            null,
          ))
        )
          await tx.contentLearningRelease.updateMany({
            where: {
              id: release.priorReleaseId,
              synthetic: false,
              isDeleted: false,
            },
            data: {
              stage: 'stable',
              activeCells: cells,
              revision: { increment: 1 },
            },
          });
        return tx.contentLearningOperation.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            scope: 'global-admin',
            requestId: input.requestId,
            payloadHash,
            type: 'release-control',
            beforeRevision: release.revision,
            afterRevision: release.revision + 1,
            status: 'completed',
            resultReferences: toPrismaJson({ releaseId: release.id, stage }),
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async receive(organizationId: string, credentialId: string, cell: string) {
    const account = await this.prisma.contentLearningAccount.findFirst({
      where: { organizationId, credentialId, isDeleted: false },
    });
    if (!account || account.sharedReleasePreference === 'disabled') return null;
    const brand = await this.prisma.contentLearningBrandPreference.findFirst({
      where: { organizationId, brandId: account.brandId, isDeleted: false },
    });
    if (brand?.preference === 'disabled') return null;
    const pinned =
      account.sharedReleasePreference === 'pinned'
        ? account.pinnedReleaseId
        : brand?.preference === 'pinned'
          ? brand.pinnedReleaseId
          : null;
    const releases = await this.prisma.contentLearningRelease.findMany({
      where: {
        ...(pinned ? { id: pinned } : { activeCells: { has: cell } }),
        synthetic: false,
        stage: { in: ['canary', 'limited', 'stable'] },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
    });
    for (const release of releases) {
      if (
        !(await this.dependencies.valid(
          'release',
          release.id,
          this.prisma,
          null,
        ))
      )
        continue;
      const bucket =
        Number.parseInt(
          learningHash([account.id, release.recipientSalt]).slice(0, 8),
          16,
        ) / 4294967296;
      const threshold =
        release.stage === 'canary'
          ? 0.05
          : release.stage === 'limited'
            ? 0.25
            : 1;
      if (
        release.stage !== 'stable' &&
        (account.mode !== 'live' || bucket >= threshold)
      )
        continue;
      return release;
    }
    return null;
  }
}

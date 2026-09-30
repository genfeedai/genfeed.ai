import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  type LearningActor,
  LearningOperationService,
  learningHash,
} from '@api/collections/content-learning/services/learning-operation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LEARNING_ARMS } from '@genfeedai/harness';
import { toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
@Injectable()
export class LearningAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: LearningOperationService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async credential(
    organizationId: string,
    credentialId: string,
    brandId?: string,
  ) {
    const credential = await this.prisma.credential.findFirst({
      where: {
        id: credentialId,
        organizationId,
        isDeleted: false,
        ...(brandId ? { brandId } : {}),
      },
    });
    if (!credential?.brandId) throw new NotFoundException('Account not found');
    const brand = await this.prisma.brand.findFirst({
      where: { id: credential.brandId, organizationId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Account not found');
    return { ...credential, brandId: credential.brandId };
  }
  async ensure(organizationId: string, credentialId: string) {
    const credential = await this.credential(organizationId, credentialId);
    return this.prisma.contentLearningAccount.upsert({
      where: { organizationId_credentialId: { organizationId, credentialId } },
      create: { organizationId, credentialId, brandId: credential.brandId },
      update: {},
    });
  }
  async read(organizationId: string, credentialId: string) {
    await this.credential(organizationId, credentialId);
    const account = await this.prisma.contentLearningAccount.findFirst({
      where: { organizationId, credentialId, isDeleted: false },
    });
    if (!account)
      return {
        id: credentialId,
        organizationId,
        credentialId,
        mode: 'shadow',
        revision: 0,
        epoch: 0,
        baselineCount: 0,
        approvedArmIds: [],
        sharingConsentVersion: null,
        sharedReleasePreference: 'automatic',
        activePolicyId: null,
        failureReason: null,
        driftState: null,
      };
    const baselineCount = await this.prisma.contentLearningCheckpoint.count({
      where: {
        organizationId,
        credentialId,
        isDeleted: false,
        validity: 'valid',
        windowId: '48h-v1',
      },
    });
    return { ...account, baselineCount };
  }
  async list(actor: LearningActor, brandId: string) {
    await this.operations.assertMember(actor);
    const credentials = await this.prisma.credential.findMany({
      where: {
        organizationId: actor.organizationId,
        brandId,
        isDeleted: false,
      },
      select: { id: true },
    });
    return Promise.all(
      credentials.map((credential) =>
        this.read(actor.organizationId, credential.id),
      ),
    );
  }
  async control(
    actor: LearningActor,
    credentialId: string,
    body: {
      action: string;
      expectedRevision: number;
      requestId: string;
      reason: string;
      approvedArmIds?: string[];
      policyId?: string;
    },
  ) {
    await this.operations.assertMember(actor, true);
    await this.ensure(actor.organizationId, credentialId);
    return this.operations.mutate(
      { actor, credentialId, ...body, type: 'account-control', payload: body },
      async (tx, account) => {
        const modes: Record<string, string> = {
          live: 'live',
          pause: 'paused',
          resume: 'live',
          reset: 'shadow',
          rollback: 'paused',
          shadow: 'shadow',
          disable: 'disabled',
        };
        if (!modes[body.action])
          throw new BadRequestException('Unsupported control');
        if (
          body.approvedArmIds?.some(
            (arm) =>
              !LEARNING_ARMS.includes(arm as (typeof LEARNING_ARMS)[number]),
          )
        )
          throw new BadRequestException('Unsupported arm');
        if (body.action === 'resume' && account.failureReason)
          throw new ConflictException('Rebuild valid evidence before resuming');
        if (body.action === 'rollback') {
          const policy = await tx.contentLearningPolicyVersion.findFirst({
            where: {
              id: body.policyId,
              organizationId: actor.organizationId,
              credentialId,
              epoch: account.epoch,
              isDeleted: false,
              state: { in: ['active', 'retired'] },
              synthetic: false,
            },
          });
          if (
            !policy ||
            !(await this.dependencies.valid('policy', policy.id, tx))
          )
            throw new ConflictException('No valid in-epoch predecessor');
        }
        if (body.action === 'reset')
          await tx.contentLearningPolicyVersion.updateMany({
            where: {
              organizationId: actor.organizationId,
              credentialId,
              isDeleted: false,
            },
            data: { state: 'retired' },
          });
        await tx.contentLearningAccount.updateMany({
          where: {
            id: account.id,
            organizationId: actor.organizationId,
            isDeleted: false,
          },
          data: {
            mode: modes[body.action],
            ...(body.action === 'live'
              ? {
                  approvedArmIds: body.approvedArmIds ?? [],
                  pilotStartedAt: new Date(),
                  prePilotReleaseId: account.pinnedReleaseId,
                }
              : {}),
            ...(body.action === 'reset'
              ? {
                  epoch: { increment: 1 },
                  resetAt: new Date(),
                  activePolicyId: null,
                  approvedArmIds: [],
                  failureReason: null,
                }
              : {}),
            ...(body.action === 'rollback'
              ? { activePolicyId: body.policyId }
              : {}),
          },
        });
        return { accountId: account.id, mode: modes[body.action] };
      },
    );
  }
  async sharing(
    actor: LearningActor,
    credentialId: string,
    body: {
      enabled: boolean;
      noticeVersion: string;
      expectedRevision: number;
      requestId: string;
    },
  ) {
    await this.operations.assertMember(actor, true, body.enabled);
    await this.ensure(actor.organizationId, credentialId);
    return this.operations.mutate(
      { actor, credentialId, ...body, type: 'sharing-consent', payload: body },
      async (tx, account) => {
        const previous = await tx.contentLearningConsent.findFirst({
          where: {
            organizationId: actor.organizationId,
            accountId: account.id,
            isDeleted: false,
          },
          orderBy: { version: 'desc' },
        });
        const version = (previous?.version ?? 0) + 1;
        const consent = await tx.contentLearningConsent.create({
          data: {
            organizationId: account.organizationId,
            brandId: account.brandId,
            credentialId,
            accountId: account.id,
            version,
            granted: body.enabled,
            actorId: actor.actorId,
            noticeVersion: body.noticeVersion,
            ...(body.enabled
              ? { grantedAt: new Date() }
              : { revokedAt: new Date() }),
          },
        });
        if (!body.enabled && previous)
          await this.dependencies.invalidate('consent', previous.id, tx);
        await tx.contentLearningAccount.updateMany({
          where: {
            id: account.id,
            organizationId: actor.organizationId,
            isDeleted: false,
          },
          data: {
            sharingConsentVersion: body.enabled ? version : null,
            ...(!body.enabled ? { mode: 'paused' } : {}),
          },
        });
        return {
          accountId: account.id,
          consentId: consent.id,
          granted: body.enabled,
        };
      },
    );
  }
  async receiving(
    actor: LearningActor,
    credentialId: string,
    body: {
      preference: string;
      releaseId?: string;
      expectedRevision: number;
      requestId: string;
    },
  ) {
    await this.operations.assertMember(actor, true);
    await this.ensure(actor.organizationId, credentialId);
    if (body.preference === 'pinned') {
      const release = await this.prisma.contentLearningRelease.findFirst({
        where: {
          id: body.releaseId,
          synthetic: false,
          stage: { in: ['canary', 'limited', 'stable'] },
          isDeleted: false,
        },
      });
      if (!release || !(await this.dependencies.valid('release', release.id)))
        throw new ConflictException(
          'Pinned release must be valid real evidence',
        );
    }
    return this.operations.mutate(
      { actor, credentialId, ...body, type: 'shared-receiving', payload: body },
      async (tx, account) => {
        await tx.contentLearningAccount.updateMany({
          where: {
            id: account.id,
            organizationId: actor.organizationId,
            isDeleted: false,
          },
          data: {
            sharedReleasePreference: body.preference,
            pinnedReleaseId:
              body.preference === 'pinned' ? body.releaseId : null,
          },
        });
        return { accountId: account.id, preference: body.preference };
      },
    );
  }
  async attest(
    actor: LearningActor,
    postId: string,
    body: {
      isOrganic: boolean;
      isPinned: boolean;
      coverThrough: string;
      expectedRevision: number;
      requestId: string;
    },
  ) {
    await this.operations.assertMember(actor, true);
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    if (!post?.credentialId)
      throw new NotFoundException('Owned destination post not found');
    const account = await this.ensure(actor.organizationId, post.credentialId);
    if (!body.isOrganic || body.isPinned)
      throw new BadRequestException(
        'Attestation must explicitly confirm organic and not pinned',
      );
    return this.operations.mutate(
      {
        actor,
        credentialId: post.credentialId,
        ...body,
        type: 'post-eligibility',
        payload: body,
      },
      async (tx) => {
        const latest = await tx.contentLearningCheckpoint.findFirst({
          where: {
            organizationId: actor.organizationId,
            postId,
            credentialId: post.credentialId,
            isDeleted: false,
          },
          orderBy: { revision: 'desc' },
        });
        const provenance = latest?.organicProvenance;
        if (
          provenance &&
          typeof provenance === 'object' &&
          !Array.isArray(provenance) &&
          (('isPaid' in provenance && provenance.isPaid === true) ||
            ('isPinned' in provenance && provenance.isPinned === true))
        )
          throw new ConflictException(
            'Explicit provider paid/pinned evidence overrides attestation',
          );
        const coverThrough = new Date(body.coverThrough);
        if (
          !Number.isFinite(coverThrough.getTime()) ||
          (latest && coverThrough < latest.receivedAt)
        )
          throw new BadRequestException(
            'Attestation must cover publication through checkpoint',
          );
        return {
          postId,
          accountId: account.id,
          actorId: actor.actorId,
          attestedAt: new Date().toISOString(),
          coverThrough: coverThrough.toISOString(),
          isOrganic: true,
          isPinned: false,
        };
      },
    );
  }
  async brandReceiving(
    actor: LearningActor,
    brandId: string,
    body: {
      preference: string;
      releaseId?: string;
      expectedRevision: number;
      requestId: string;
    },
  ) {
    await this.operations.assertMember(actor, true);
    const brand = await this.prisma.brand.findFirst({
      where: {
        id: brandId,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    if (!brand) throw new NotFoundException('Brand not found');
    if (body.preference === 'pinned') {
      const release = await this.prisma.contentLearningRelease.findFirst({
        where: {
          id: body.releaseId,
          synthetic: false,
          stage: { in: ['canary', 'limited', 'stable'] },
          isDeleted: false,
        },
      });
      if (!release || !(await this.dependencies.valid('release', release.id)))
        throw new ConflictException('Valid pinned release required');
    }
    const scope = learningHash([
        actor.organizationId,
        brandId,
        'brand-receiving',
      ]),
      payloadHash = learningHash(body);
    return this.prisma.$transaction(async (tx) => {
      await tx.contentLearningBrandPreference.upsert({
        where: {
          organizationId_brandId: {
            organizationId: actor.organizationId,
            brandId,
          },
        },
        create: { organizationId: actor.organizationId, brandId },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM content_learning_brand_preferences WHERE "organizationId" = ${actor.organizationId} AND "brandId" = ${brandId} ORDER BY id FOR UPDATE`;
      const previous = await tx.contentLearningOperation.findFirst({
        where: {
          actorId: actor.actorId,
          scope,
          requestId: body.requestId,
          isDeleted: false,
        },
      });
      if (previous) {
        if (previous.payloadHash !== payloadHash)
          throw new ConflictException('Request key conflict');
        return previous;
      }
      const preference = await tx.contentLearningBrandPreference.findFirst({
        where: {
          organizationId: actor.organizationId,
          brandId,
          isDeleted: false,
        },
      });
      if (!preference || preference.revision !== body.expectedRevision)
        throw new ConflictException({
          currentRevision: preference?.revision ?? 0,
        });
      await tx.contentLearningBrandPreference.updateMany({
        where: {
          id: preference.id,
          organizationId: actor.organizationId,
          isDeleted: false,
          revision: preference.revision,
        },
        data: {
          preference: body.preference,
          pinnedReleaseId: body.preference === 'pinned' ? body.releaseId : null,
          revision: { increment: 1 },
        },
      });
      return tx.contentLearningOperation.create({
        data: {
          organizationId: actor.organizationId,
          brandId,
          actorId: actor.actorId,
          scope,
          requestId: body.requestId,
          payloadHash,
          type: 'brand-receiving',
          beforeRevision: preference.revision,
          afterRevision: preference.revision + 1,
          status: 'completed',
          resultReferences: toPrismaJson({
            brandId,
            preference: body.preference,
          }),
        },
      });
    });
  }
  async emergencyPause(
    actorId: string,
    accountId: string,
    body: { expectedRevision: number; requestId: string; reason: string },
  ) {
    const account = await this.prisma.contentLearningAccount.findFirst({
      where: { id: accountId, isDeleted: false },
    });
    if (!account) throw new NotFoundException('Account unavailable');
    return this.operations.mutate(
      {
        actor: { actorId, organizationId: account.organizationId },
        credentialId: account.credentialId,
        ...body,
        type: 'admin-emergency-pause',
        payload: body,
      },
      async (tx, current) => {
        await tx.contentLearningAccount.updateMany({
          where: {
            id: current.id,
            organizationId: current.organizationId,
            isDeleted: false,
          },
          data: { mode: 'paused' },
        });
        return { accountId, mode: 'paused' };
      },
    );
  }
}

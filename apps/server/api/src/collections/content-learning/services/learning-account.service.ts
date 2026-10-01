import { selectLearningBaseline } from '@api/collections/content-learning/services/learning-baseline-selection';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import {
  type LearningActor,
  LearningOperationService,
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { LearningPolicyService } from '@api/collections/content-learning/services/learning-policy.service';
import { LearningScopeStateService } from '@api/collections/content-learning/services/learning-scope-state.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  ContentLearningMode,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  learningContractIdSchema,
  learningContractRevisionSchema,
  learningContractVersionSchema,
  learningFormatSchema,
  learningGenerationReceiptSchema,
  learningObjectiveSchema,
  learningScopeViewSchema,
} from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  LearningAccountView,
  LearningBrandReceivingView,
  LearningFormat,
  LearningObjective,
  LearningScopeView,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  LEARNING_ARMS,
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import {
  type ContentLearningAccount,
  type ContentLearningScopeState,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
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
    private readonly scopes: LearningScopeStateService,
    private readonly policies: LearningPolicyService,
  ) {}
  async credential(
    organizationId: string,
    credentialId: string,
    brandId?: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const credential = await tx.credential.findFirst({
      where: scopedWhere(organizationId, {
        id: credentialId,
        ...(brandId ? { brandId } : {}),
      }),
    });
    if (!credential?.brandId) throw new NotFoundException('Account not found');
    const brand = await tx.brand.findFirst({
      where: { id: credential.brandId, organizationId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Account not found');
    return { ...credential, brandId: credential.brandId };
  }
  async ensure(
    organizationId: string,
    credentialId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const credential = await this.credential(
      organizationId,
      credentialId,
      undefined,
      tx,
    );
    // tenant-scope-ignore: unique-key upsert; organizationId is part of the key
    return tx.contentLearningAccount.upsert({
      where: { organizationId_credentialId: { organizationId, credentialId } },
      create: { organizationId, credentialId, brandId: credential.brandId },
      update: {},
    });
  }
  private accountConfiguration(
    account: ContentLearningAccount,
    organizationId: string,
    brandId: string,
    credentialId: string,
  ) {
    const mode = Object.values(ContentLearningMode).find(
      (value) => value === account.mode,
    );
    const preference = (['automatic', 'disabled', 'pinned'] as const).find(
      (value) => value === account.sharedReleasePreference,
    );
    if (
      !mode ||
      !preference ||
      account.isDeleted ||
      account.organizationId !== organizationId ||
      account.brandId !== brandId ||
      account.credentialId !== credentialId ||
      ![
        account.id,
        organizationId,
        brandId,
        credentialId,
        account.activeConfigVersion,
      ].every((value) => learningContractIdSchema.safeParse(value).success) ||
      !learningContractRevisionSchema.safeParse(account.revision).success ||
      !learningContractRevisionSchema.safeParse(account.epoch).success ||
      (account.sharingConsentVersion !== null &&
        !learningContractVersionSchema.safeParse(account.sharingConsentVersion)
          .success) ||
      (account.pinnedReleaseId !== null &&
        !learningContractIdSchema.safeParse(account.pinnedReleaseId).success) ||
      (preference === 'pinned' && !account.pinnedReleaseId) ||
      !Array.isArray(account.approvedArmIds) ||
      account.approvedArmIds.some((arm) => typeof arm !== 'string') ||
      (account.failureReason !== null &&
        typeof account.failureReason !== 'string') ||
      (account.driftState !== null && typeof account.driftState !== 'string')
    )
      throw new ConflictException('Learning account state unavailable');
    return { mode, preference };
  }
  private scopeDescriptor(
    account: ContentLearningAccount,
    platform: string | null,
    scope: ContentLearningScopeState,
  ) {
    const descriptor = scope.cellDescriptor;
    if (
      !validLearningDescriptor(descriptor) ||
      !/^[a-f0-9]{64}$/.test(scope.descriptorHash) ||
      learningHash(learningDescriptorTuple(descriptor)) !==
        scope.descriptorHash ||
      descriptor.platform !== platform ||
      scope.organizationId !== account.organizationId ||
      scope.brandId !== account.brandId ||
      scope.credentialId !== account.credentialId ||
      scope.epoch !== account.epoch ||
      scope.isDeleted ||
      !learningContractRevisionSchema.safeParse(scope.epoch).success ||
      !learningContractRevisionSchema.safeParse(scope.revision).success ||
      learningScopeKey({
        organizationId: account.organizationId,
        brandId: account.brandId,
        credentialId: account.credentialId,
        platform: descriptor.platform,
        format: descriptor.format,
        objective: descriptor.objective,
        rewardProfileId: scope.descriptorHash,
      }) !== scope.scopeKey
    )
      throw new ConflictException('Learning scope state unavailable');
    return descriptor;
  }
  private async projectScope(
    tx: Prisma.TransactionClient,
    account: ContentLearningAccount,
    scope: ContentLearningScopeState,
    descriptor: ReturnType<LearningAccountService['scopeDescriptor']>,
    cutoff: Date,
  ): Promise<LearningScopeView> {
    const selected = await selectLearningBaseline(
      tx,
      {
        organizationId: account.organizationId,
        brandId: account.brandId,
        credentialId: account.credentialId,
        platform: descriptor.platform,
        format: descriptor.format,
        objective: descriptor.objective,
        rewardProfileId: scope.descriptorHash,
      },
      cutoff,
      descriptor,
      this.dependencies,
    );
    const current = await this.policies.current(
      account.organizationId,
      account.credentialId,
      scope.scopeKey,
      tx,
    );
    const baselineCount = selected.samples.length,
      unavailableReasons: string[] = [];
    if (account.mode !== 'live') unavailableReasons.push('account_not_live');
    if (account.failureReason) unavailableReasons.push('account_failure');
    if (baselineCount < 20) unavailableReasons.push('insufficient_baseline');
    if (!current) unavailableReasons.push('policy_unavailable');
    const at = scope.lastValidRewardAt;
    const projection = {
      scopeKey: scope.scopeKey,
      epoch: scope.epoch,
      revision: scope.revision,
      descriptor,
      descriptorHash: scope.descriptorHash,
      baselineCount,
      activePolicyId: current?.id ?? null,
      pinnedPolicyId: scope.pinnedPolicyId,
      lastValidRewardAt:
        current &&
        at &&
        Number.isFinite(at.getTime()) &&
        at.getTime() <= cutoff.getTime() &&
        at.getTime() >= cutoff.getTime() - 30 * 86400000
          ? at.toISOString()
          : null,
      unavailableReasons,
    };
    const parsed = learningScopeViewSchema.safeParse(projection);
    if (!parsed.success)
      throw new ConflictException('Learning scope state unavailable');
    return parsed.data;
  }
  private async latestSelectedDecision(
    tx: Prisma.TransactionClient,
    account: ContentLearningAccount,
    scopes: LearningScopeView[],
  ) {
    if (!scopes.length) return undefined;
    const decision = await tx.contentLearningDecision.findFirst({
      where: scopedWhere(account.organizationId, {
        brandId: account.brandId,
        credentialId: account.credentialId,
        epoch: account.epoch,
        accountRevision: account.revision,
        synthetic: false,
        OR: scopes.map((scope) => ({
          scopeKey: scope.scopeKey,
          descriptorHash: scope.descriptorHash,
          scopeRevision: scope.revision,
        })),
      }),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    if (
      !decision ||
      decision.isDeleted ||
      decision.synthetic ||
      decision.organizationId !== account.organizationId ||
      decision.brandId !== account.brandId ||
      decision.credentialId !== account.credentialId ||
      decision.epoch !== account.epoch ||
      decision.accountRevision !== account.revision
    )
      return undefined;
    const scope = scopes.find(
      (row) =>
        row.scopeKey === decision.scopeKey &&
        row.descriptorHash === decision.descriptorHash &&
        row.revision === decision.scopeRevision,
    );
    if (
      !scope ||
      decision.mode !== account.mode ||
      !validLearningDescriptor(decision.cellDescriptor) ||
      learningHash(learningDescriptorTuple(decision.cellDescriptor)) !==
        scope.descriptorHash ||
      (decision.accountPolicyId !== null &&
        decision.accountPolicyId !== scope.activePolicyId) ||
      !(await this.dependencies.valid(
        'decision',
        decision.id,
        tx,
        account.organizationId,
      ))
    )
      return undefined;
    const receipt = {
      decisionId: decision.id,
      credentialId: decision.credentialId,
      mode: decision.mode,
      accountRevision: decision.accountRevision,
      scopeRevision: decision.scopeRevision,
      epoch: decision.epoch,
      armId: decision.selectedArmId,
      cellDescriptor: decision.cellDescriptor,
      descriptorHash: decision.descriptorHash,
      configVersion: decision.configVersion,
      synthetic: false,
      ...(decision.baselineId !== null
        ? { baselineId: decision.baselineId }
        : {}),
      ...(decision.accountPolicyId !== null
        ? { policyVersionId: decision.accountPolicyId }
        : {}),
    };
    const parsed = learningGenerationReceiptSchema.safeParse(receipt);
    return parsed.success ? parsed.data : undefined;
  }
  async read(
    organizationId: string,
    credentialId: string,
    format?: LearningFormat,
    objective?: LearningObjective,
  ): Promise<LearningAccountView> {
    if (
      (format !== undefined &&
        !learningFormatSchema.safeParse(format).success) ||
      (objective !== undefined &&
        !learningObjectiveSchema.safeParse(objective).success)
    )
      throw new BadRequestException('Invalid learning scope filter');
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
      const credential = await this.credential(
        organizationId,
        credentialId,
        undefined,
        tx,
      );
      const initial = await tx.contentLearningAccount.findFirst({
        where: scopedWhere(organizationId, {
          brandId: credential.brandId,
          credentialId,
        }),
      });
      if (!initial)
        return {
          id: credentialId,
          organizationId,
          brandId: credential.brandId,
          credentialId,
          mode: ContentLearningMode.SHADOW,
          revision: 0,
          epoch: 0,
          sharingConsentVersion: null,
          pinnedReleaseId: null,
          activePolicyId: null,
          failureReason: null,
          driftState: null,
          sharedReleasePreference: 'automatic',
          approvedArmIds: [],
          baselineCount: 0,
          scopes: [],
        };
      await tx.$queryRaw`SELECT id FROM content_learning_accounts WHERE id = ${initial.id} AND "organizationId" = ${organizationId} AND "brandId" = ${credential.brandId} AND "credentialId" = ${credentialId} AND "isDeleted" = false ORDER BY id FOR SHARE`;
      const account = await tx.contentLearningAccount.findFirst({
        where: scopedWhere(organizationId, {
          id: initial.id,
          brandId: credential.brandId,
          credentialId,
        }),
      });
      if (
        !account ||
        account.id !== initial.id ||
        account.organizationId !== organizationId ||
        account.brandId !== credential.brandId ||
        account.credentialId !== credentialId
      )
        throw new ConflictException('Learning account changed');
      const configuration = this.accountConfiguration(
        account,
        organizationId,
        credential.brandId,
        credentialId,
      );
      await tx.$queryRaw`SELECT id FROM content_learning_scope_states WHERE "organizationId" = ${organizationId} AND "brandId" = ${credential.brandId} AND "credentialId" = ${credentialId} AND epoch = ${account.epoch} AND "isDeleted" = false ORDER BY "scopeKey", id FOR SHARE`;
      const rows = await tx.contentLearningScopeState.findMany({
        where: scopedWhere(organizationId, {
          brandId: credential.brandId,
          credentialId,
          epoch: account.epoch,
        }),
        orderBy: [{ scopeKey: 'asc' }, { id: 'asc' }],
      });
      const currentCredential = await this.credential(
        organizationId,
        credentialId,
        credential.brandId,
        tx,
      );
      const cutoff = new Date();
      const validated = rows.map((row) => ({
        row,
        descriptor: this.scopeDescriptor(
          account,
          fromPrismaCredentialPlatform(currentCredential.platform),
          row,
        ),
      }));
      const scopes: LearningScopeView[] = [];
      for (const { row, descriptor } of validated
        .filter(
          ({ descriptor }) =>
            (format === undefined || descriptor.format === format) &&
            (objective === undefined || descriptor.objective === objective),
        )
        .sort((a, b) => a.row.scopeKey.localeCompare(b.row.scopeKey)))
        scopes.push(
          await this.projectScope(tx, account, row, descriptor, cutoff),
        );
      const latestDecision = await this.latestSelectedDecision(
          tx,
          account,
          scopes,
        ),
        singleton = scopes.length === 1 ? scopes[0] : undefined;
      return {
        ...account,
        mode: configuration.mode,
        sharedReleasePreference: configuration.preference,
        baselineCount: singleton?.baselineCount ?? 0,
        activePolicyId: singleton?.activePolicyId ?? null,
        scopes,
        ...(latestDecision ? { latestDecision } : {}),
      };
    });
  }
  async readBrandReceiving(
    actor: LearningActor,
    brandId: string,
  ): Promise<LearningBrandReceivingView> {
    await this.operations.assertMember(actor);
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
      const brand = await tx.brand.findFirst({
        where: scopedWhere(actor.organizationId, { id: brandId }),
      });
      if (!brand) throw new NotFoundException('Brand not found');
      const row = await tx.contentLearningBrandPreference.findFirst({
        where: scopedWhere(actor.organizationId, { brandId }),
      });
      const preference = row
        ? (['automatic', 'disabled', 'pinned'] as const).find(
            (value) => value === row.preference,
          )
        : 'automatic';
      if (
        !preference ||
        (row &&
          (!learningContractRevisionSchema.safeParse(row.revision).success ||
            (row.pinnedReleaseId !== null &&
              !learningContractIdSchema.safeParse(row.pinnedReleaseId)
                .success) ||
            (preference === 'pinned' && !row.pinnedReleaseId)))
      )
        throw new ConflictException('Brand receiving state unavailable');
      return {
        id: brandId,
        brandId,
        revision: row?.revision ?? 0,
        preference,
        pinnedReleaseId: row?.pinnedReleaseId ?? null,
      };
    });
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
          if (!body.policyId?.trim())
            throw new BadRequestException('Rollback requires policyId');
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
            !(await this.dependencies.valid(
              'policy',
              policy.id,
              tx,
              actor.organizationId,
            ))
          )
            throw new ConflictException('No valid in-epoch predecessor');
          await this.scopes.pin(
            tx,
            actor.organizationId,
            credentialId,
            policy.id,
            account.epoch,
          );
        }
        if (body.action === 'live')
          await this.scopes.clearPins(
            tx,
            actor.organizationId,
            credentialId,
            account.epoch,
          );
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
      if (!body.releaseId?.trim())
        throw new BadRequestException('Pinned receiving requires releaseId');
      const release = await this.prisma.contentLearningRelease.findFirst({
        where: {
          id: body.releaseId,
          synthetic: false,
          stage: { in: ['canary', 'limited', 'stable'] },
          isDeleted: false,
        },
      });
      if (
        !release ||
        !(await this.dependencies.valid(
          'release',
          release.id,
          this.prisma,
          null,
        ))
      )
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
    const credentialId = post.credentialId;
    const account = await this.ensure(actor.organizationId, credentialId);
    if (!body.isOrganic || body.isPinned)
      throw new BadRequestException(
        'Attestation must explicitly confirm organic and not pinned',
      );
    return this.operations.mutate(
      {
        actor,
        credentialId,
        ...body,
        type: 'post-eligibility',
        payload: {
          organizationId: actor.organizationId,
          brandId: post.brandId,
          credentialId,
          resourceKind: 'post',
          resourceId: postId,
          ...body,
        },
      },
      async (tx) => {
        const latest = await tx.contentLearningCheckpoint.findFirst({
          where: {
            organizationId: actor.organizationId,
            postId,
            credentialId,
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
      if (!body.releaseId?.trim())
        throw new BadRequestException('Pinned receiving requires releaseId');
      const release = await this.prisma.contentLearningRelease.findFirst({
        where: {
          id: body.releaseId,
          synthetic: false,
          stage: { in: ['canary', 'limited', 'stable'] },
          isDeleted: false,
        },
      });
      if (
        !release ||
        !(await this.dependencies.valid(
          'release',
          release.id,
          this.prisma,
          null,
        ))
      )
        throw new ConflictException('Valid pinned release required');
    }
    const scope = learningHash([
        actor.organizationId,
        brandId,
        'brand-receiving',
      ]),
      payloadHash = learningHash([
        'brand-receiving',
        actor.organizationId,
        brandId,
        body,
      ]);
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'exclusive');
      // tenant-scope-ignore: unique-key upsert; organizationId is part of the key
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
        where: scopedWhere(actor.organizationId, {
          actorId: actor.actorId,
          scope,
          requestId: body.requestId,
        }),
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
    // tenant-scope-ignore: platform emergency pause locates the account then mutates through its organization
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

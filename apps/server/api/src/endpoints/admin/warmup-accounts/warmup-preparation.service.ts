import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { PrepareWarmupAccountDto } from '@api/endpoints/admin/warmup-accounts/dto/prepare-warmup-account.dto';
import { AdminWarmupAccountsService } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.service';
import {
  assertWarmupMutable,
  creditWarmupWallet,
  lockWarmup,
  reconcileWarmupWorkspace,
  warmupDiagnostics,
  warmupScope,
} from '@api/endpoints/admin/warmup-accounts/warmup-workspace';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IWarmupPreparation } from '@genfeedai/contracts/interfaces';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromWebsiteScrape,
} from '@genfeedai/helpers';
import { Prisma, type WarmupAccount } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class WarmupPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AdminWarmupAccountsService,
    private readonly brands: BrandsService,
    private readonly workflows: SystemWorkflowRunnerService,
    private readonly moduleRef: ModuleRef,
    private readonly scraper: BrandScraperService,
    private readonly brandDataMapper: BrandDataMapper,
  ) {}

  async prepare(id: string, actorUserId: string, dto: PrepareWarmupAccountDto) {
    // tenant-scope-ignore: Platform-wide lookup is gated by WarmupAccountsController SuperAdminGuard and IpWhitelistGuard; the returned account supplies the target organization for all preparation writes.
    const account = await this.prisma.warmupAccount.findFirst({
      where: { id, isDeleted: false },
    });
    if (!account) throw new NotFoundException('Warm-up account not found');
    assertWarmupMutable(account);
    warmupScope(account);
    // Preparation always uses the recorded operator, never the customer's identity.
    if (actorUserId !== account.operatorUserId)
      throw new BadRequestException(
        'Only the recorded preparation operator may author this workspace',
      );
    try {
      if (dto.action === 'preview-context') {
        await this.previewContext(account, actorUserId, dto);
      } else if (dto.action === 'apply-context') {
        await this.applyContext(account, actorUserId, dto);
      } else if (dto.action === 'starter-content') {
        await this.startContent(account, actorUserId, dto);
      } else {
        if (dto.action === 'repair')
          await this.resumeStarterGeneration(account, actorUserId);
        await this.prepareResources(account, actorUserId, dto);
      }
    } catch (error) {
      await this.recordFailure(account, actorUserId, dto.action);
      throw error;
    }
    return this.accounts.get(id);
  }

  private async resumeStarterGeneration(
    account: WarmupAccount,
    actorUserId: string,
  ): Promise<void> {
    const scope = warmupScope(account);
    const generation = warmupDiagnostics(account).preparation?.generation;
    if (generation) {
      const execution = await this.prisma.workflowExecution.findFirst({
        where: {
          organizationId: scope.organizationId,
          userId: actorUserId,
          idempotencyKey: generation.key,
          isDeleted: false,
        },
      });
      if (
        !execution &&
        Date.now() - new Date(generation.startedAt).getTime() > 120000
      ) {
        await this.dispatchStarterContent(account, actorUserId, {
          action: 'starter-content',
          assetCandidateId: generation.assetCandidateId,
          prompt: generation.prompt,
        });
      }
      if (execution?.status === 'FAILED' && execution.failedNodeId) {
        await this.moduleRef
          .get(WorkflowExecutorService, { strict: false })
          .continueExistingExecution(execution.id, {
            organizationId: scope.organizationId,
            userId: actorUserId,
            platform: 'manual',
            type: 'resume',
            data: {},
          });
      }
    }
  }

  private async previewContext(
    account: WarmupAccount,
    actorUserId: string,
    dto: PrepareWarmupAccountDto,
  ): Promise<void> {
    const scope = warmupScope(account);
    const url = dto.sourceUrl ?? account.websiteUrl;
    if (!url) throw new BadRequestException('A public website URL is required');
    const context = await this.brands.crawlWebsiteBrandKitDraft(
      scope.brandId,
      scope.organizationId,
      { url },
    );
    if (dto.publicProfileUrl) {
      const profile = this.scraper.detectUrlType(dto.publicProfileUrl);
      if (!profile.linkedinUrl && !profile.xProfileUrl)
        throw new BadRequestException('Use a public LinkedIn or X profile URL');
      const brand = await this.brands.findOne({
        id: scope.brandId,
        organizationId: scope.organizationId,
        isDeleted: false,
      });
      if (!brand)
        throw new BadRequestException('Prepared brand is unavailable');
      const merged = await this.scraper.scrapeAllSources({
        websiteUrl: url,
        linkedinUrl: profile.linkedinUrl,
        xProfileUrl: profile.xProfileUrl,
      });
      const combined = buildBrandKitDraftFromWebsiteScrape(
        brand as unknown as BrandKitSourceBrand,
        this.brandDataMapper.mapMergedSources(merged, url),
      );
      Object.assign(context, combined);
      context.evidence.push({
        sourceType: 'website',
        label: 'Public profile source; verify extracted fields before applying',
        url: dto.publicProfileUrl,
      });
    }
    if (context.diagnostics.some((item) => item.severity === 'error'))
      throw new BadRequestException(
        'Public context import failed; review the source and retry',
      );
    await this.update(
      account,
      actorUserId,
      {
        context,
        contextReviewedAt: undefined,
        contextReviewedBy: undefined,
      },
      'Imported public brand context for review.',
    );
  }

  private async applyContext(
    account: WarmupAccount,
    actorUserId: string,
    dto: PrepareWarmupAccountDto,
  ): Promise<void> {
    const scope = warmupScope(account);
    const id = account.id;
    const decisions = dto.contextDecisions;
    if (!decisions)
      throw new BadRequestException(
        'Select the imported context fields to apply',
      );
    await this.prisma.$transaction(async (tx) => {
      await lockWarmup(tx, id);
      const current = await tx.warmupAccount.findFirstOrThrow({
        where: {
          id,
          organizationId: scope.organizationId,
          isDeleted: false,
        },
      });
      assertWarmupMutable(current);
      if (!warmupDiagnostics(current).preparation?.context)
        throw new BadRequestException('Import context before applying it');
      const result = await this.brands.applyBrandKitDraft(
        scope.brandId,
        scope.organizationId,
        decisions,
      );
      if (!result.appliedFields.length || result.status === 'blocked')
        throw new BadRequestException('No accepted brand context was applied');
      await this.persist(
        tx,
        current,
        actorUserId,
        {
          ...warmupDiagnostics(current).preparation,
          contextReviewedAt: new Date().toISOString(),
          contextReviewedBy: actorUserId,
        },
        `Applied reviewed brand fields: ${result.appliedFields.join(', ')}.`,
      );
    });
  }

  private async prepareResources(
    account: WarmupAccount,
    actorUserId: string,
    dto: PrepareWarmupAccountDto,
  ): Promise<void> {
    const scope = warmupScope(account);
    const id = account.id;
    await this.prisma.$transaction(async (tx) => {
      await lockWarmup(tx, id);
      const current = await tx.warmupAccount.findFirstOrThrow({
        where: {
          id,
          organizationId: scope.organizationId,
          isDeleted: false,
        },
      });
      assertWarmupMutable(current);
      await reconcileWarmupWorkspace(tx, current);
      let preparation = warmupDiagnostics(current).preparation ?? {};
      if (dto.action === 'fund') {
        if (!dto.amount || !dto.reason?.trim())
          throw new BadRequestException(
            'A handoff amount and grant reason are required',
          );
        if (preparation.grant && preparation.grant.amount !== dto.amount)
          throw new BadRequestException(
            'The handoff grant is already configured; it cannot be silently replaced',
          );
        const transaction = await creditWarmupWallet(
          tx,
          current,
          actorUserId,
          dto.amount,
          `warmup:${id}:grant`,
          dto.reason.trim(),
        );
        preparation = {
          ...preparation,
          grant: preparation.grant ?? {
            amount: dto.amount,
            reason: dto.reason.trim(),
            transactionId: transaction.id,
            actorUserId,
            grantedAt: transaction.createdAt.toISOString(),
          },
        };
      }
      if (dto.action === 'attach-starters') {
        if (!dto.assetId || !dto.articleId)
          throw new BadRequestException(
            'Select both a private brand asset and article draft',
          );
        const [asset, article] = await Promise.all([
          tx.asset.findFirst({
            where: {
              id: dto.assetId,
              parentOrgId: scope.organizationId,
              parentBrandId: scope.brandId,
              isDeleted: false,
              userId: actorUserId,
              cloudObjectKey: { not: null },
            },
          }),
          tx.article.findFirst({
            where: {
              id: dto.articleId,
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              userId: actorUserId,
              isDeleted: false,
              status: 'DRAFT',
              publishedAt: null,
              category: 'linkedin-article',
            },
          }),
        ]);
        if (!asset || !article)
          throw new BadRequestException(
            'Starter content must belong to this operator and prepared brand and remain unpublished',
          );
        await tx.article.update({
          where: {
            id: article.id,
            organizationId: scope.organizationId,
            isDeleted: false,
          },
          data: { scope: 'ORGANIZATION' },
        });
        preparation = {
          ...preparation,
          assetId: asset.id,
          articleId: article.id,
        };
      }
      if (dto.action === 'repair')
        preparation = await this.reconcilePreparation(
          tx,
          current,
          preparation,
          actorUserId,
        );
      if (dto.action === 'archive') {
        if (preparation.generation?.status === 'running')
          throw new BadRequestException('Wait for generation before archiving');
        await tx.invitation.updateMany({
          where: {
            id: current.invitationId ?? '',
            organizationId: scope.organizationId,
            isDeleted: false,
            acceptedAt: null,
          },
          data: { revokedAt: new Date(), status: 'revoked' },
        });
        await tx.member.updateMany({
          where: {
            organizationId: scope.organizationId,
            userId: current.operatorUserId,
            isDeleted: false,
          },
          data: { isActive: false },
        });
      }
      await this.persist(
        tx,
        current,
        actorUserId,
        preparation,
        `Warm-up ${dto.action} completed.`,
        dto.action === 'archive' ? 'ARCHIVED' : undefined,
      );
    });
  }

  private async startContent(
    account: WarmupAccount,
    actorUserId: string,
    dto: PrepareWarmupAccountDto,
  ): Promise<void> {
    const { organizationId } = warmupScope(account);
    const preparation = warmupDiagnostics(account).preparation;
    if (!preparation?.contextReviewedAt || !preparation.grant)
      throw new BadRequestException(
        'Review brand context and configure credits before generation',
      );
    if (preparation.generation) {
      // The durable workflow key owns retries; repair recovers outputs without creating another run.
      await this.prepare(account.id, actorUserId, { action: 'repair' });
      return;
    }
    const candidate = preparation.context?.assetCandidates.find(
      (asset) => asset.candidateId === dto.assetCandidateId,
    );
    if (!preparation.assetId && !candidate?.url)
      throw new BadRequestException(
        'Select a reviewed public brand asset to import',
      );
    const key = `warmup:${account.id}:starter-article`;
    await this.prisma.$transaction(async (tx) => {
      await lockWarmup(tx, account.id);
      const current = await tx.warmupAccount.findFirstOrThrow({
        where: { id: account.id, organizationId, isDeleted: false },
      });
      assertWarmupMutable(current);
      if (warmupDiagnostics(current).preparation?.generation)
        throw new BadRequestException(
          'Starter preparation is already running; use repair to recover',
        );
      await this.persist(
        tx,
        current,
        actorUserId,
        {
          ...preparation,
          generation: {
            key,
            status: 'running',
            startedAt: new Date().toISOString(),
            assetCandidateId: dto.assetCandidateId,
            prompt: dto.prompt,
          },
        },
        'Started private starter preparation.',
      );
    });
    await this.dispatchStarterContent(account, actorUserId, dto);
  }

  private async dispatchStarterContent(
    account: WarmupAccount,
    actorUserId: string,
    dto: PrepareWarmupAccountDto,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await lockWarmup(tx, `${account.id}:starter-dispatch`);
        await this.dispatchStarterContentLocked(account, actorUserId, dto);
      },
      { timeout: 120000 },
    );
  }

  private async dispatchStarterContentLocked(
    account: WarmupAccount,
    actorUserId: string,
    dto: PrepareWarmupAccountDto,
  ): Promise<void> {
    const { organizationId, brandId } = warmupScope(account);
    const current = await this.prisma.warmupAccount.findFirstOrThrow({
      where: { id: account.id, organizationId, isDeleted: false },
    });
    assertWarmupMutable(current);
    const preparation = warmupDiagnostics(current).preparation ?? {};
    if (preparation.generation?.status === 'completed') return;
    if (!preparation.contextReviewedAt || !preparation.grant)
      throw new BadRequestException(
        'Review brand context and configure credits before generation',
      );
    const key =
      preparation.generation?.key ?? `warmup:${account.id}:starter-article`;
    const candidate = preparation.context?.assetCandidates.find(
      (asset) =>
        asset.candidateId ===
        (preparation.generation?.assetCandidateId ?? dto.assetCandidateId),
    );
    if (!preparation.assetId && !candidate)
      throw new BadRequestException(
        'Select the reviewed starter asset again before retrying preparation',
      );
    if (!preparation.assetId && candidate) {
      const imported = await this.brands.importBrandKitAssets(
        brandId,
        organizationId,
        actorUserId,
        { assets: [candidate] },
      );
      const assetId =
        imported.importedAssetIds[0] ??
        imported.results.find((item) => item.assetId)?.assetId;
      if (!assetId)
        throw new BadRequestException(
          'Starter asset import failed; retry the import from Brand Kit before repairing',
        );
      await this.update(
        account,
        actorUserId,
        { assetId },
        'Imported reviewed starter brand asset.',
      );
    }
    const execution = await this.workflows.enqueueWorkflow({
      canonicalId: 'article.generation',
      actionType: 'create_article',
      organizationId,
      userId: actorUserId,
      source: 'WarmupPreparationService',
      idempotencyKey: key,
      inputValues: {
        brandId,
        dto: {
          prompt:
            dto.prompt ||
            'Write a useful introductory LinkedIn article using the reviewed brand positioning and voice. Keep it an unpublished draft for customer review.',
          count: 1,
          category: 'linkedin-article',
          generateHeaderImage: false,
        },
      },
      metadata: {
        brandId,
        warmupAccountId: account.id,
        preparedByUserId: actorUserId,
      },
    });
    await this.update(
      account,
      actorUserId,
      {
        generation: {
          key,
          status: 'running',
          startedAt: new Date().toISOString(),
          workflowExecutionId: execution.executionId,
          assetCandidateId:
            preparation.generation?.assetCandidateId ?? dto.assetCandidateId,
          prompt: preparation.generation?.prompt ?? dto.prompt,
        },
      },
      'Queued private LinkedIn starter article.',
    );
  }

  private async reconcilePreparation(
    tx: Prisma.TransactionClient,
    account: WarmupAccount,
    preparation: IWarmupPreparation,
    actorUserId: string,
  ): Promise<IWarmupPreparation> {
    const { organizationId, brandId } = warmupScope(account);
    let next = { ...preparation };
    if (next.generation) {
      const execution = await tx.workflowExecution.findFirst({
        where: {
          organizationId,
          isDeleted: false,
          idempotencyKey: next.generation.key,
        },
        include: { nodeResults: true },
      });
      if (execution?.status === 'COMPLETED') {
        const result = execution.nodeResults.find(
          (node) => node.nodeId === 'invalidate-cache',
        )?.output;
        const articles =
          result && typeof result === 'object' && !Array.isArray(result)
            ? result.articles
            : undefined;
        const first = Array.isArray(articles) ? articles[0] : undefined;
        const articleId =
          first &&
          typeof first === 'object' &&
          !Array.isArray(first) &&
          typeof first.id === 'string'
            ? first.id
            : undefined;
        if (!articleId)
          throw new BadRequestException(
            'Completed starter workflow has no article output; inspect its run',
          );
        const article = await tx.article.findFirst({
          where: {
            id: articleId,
            organizationId,
            brandId,
            isDeleted: false,
            userId: actorUserId,
            status: 'DRAFT',
            publishedAt: null,
          },
        });
        if (!article)
          throw new BadRequestException(
            'Starter article is unavailable or no longer a private draft',
          );
        await tx.article.update({
          where: { id: articleId, organizationId, isDeleted: false },
          data: { scope: 'ORGANIZATION', category: 'linkedin-article' },
        });
        next = {
          ...next,
          articleId,
          generation: {
            ...next.generation,
            workflowExecutionId: execution.id,
            status: 'completed',
          },
        };
      } else if (
        execution?.status === 'FAILED' ||
        execution?.status === 'CANCELLED'
      ) {
        next = {
          ...next,
          generation: {
            ...next.generation,
            workflowExecutionId: execution.id,
            status: 'failed',
          },
        };
      }
    }
    const { balance } = await reconcileWarmupWorkspace(tx, account);
    if (
      next.grant &&
      balance.heldAmount === 0 &&
      next.generation?.status !== 'running'
    ) {
      const amount = Math.max(0, next.grant.amount - balance.balance);
      if (amount > 0) {
        await creditWarmupWallet(
          tx,
          account,
          actorUserId,
          amount,
          `warmup:${account.id}:preparation:${balance.version}`,
          'Reconcile operator preparation costs before customer handoff',
        );
        next.preparationCredits = (next.preparationCredits ?? 0) + amount;
      }
    }
    return next;
  }

  private async update(
    account: WarmupAccount,
    actorUserId: string,
    patch: Partial<IWarmupPreparation>,
    message: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockWarmup(tx, account.id);
      const current = await tx.warmupAccount.findFirstOrThrow({
        where: {
          id: account.id,
          organizationId: account.organizationId,
          isDeleted: false,
        },
      });
      assertWarmupMutable(current);
      await this.persist(
        tx,
        current,
        actorUserId,
        { ...warmupDiagnostics(current).preparation, ...patch },
        message,
      );
    });
  }

  private async persist(
    tx: Prisma.TransactionClient,
    account: WarmupAccount,
    actorUserId: string,
    preparation: IWarmupPreparation,
    message: string,
    status?: 'ARCHIVED',
  ): Promise<void> {
    const diagnostics = warmupDiagnostics(account);
    const event = { actorUserId, message, timestamp: new Date().toISOString() };
    await tx.warmupAccount.update({
      where: {
        id: account.id,
        organizationId: account.organizationId,
        isDeleted: false,
      },
      data: {
        ...(status ? { status } : {}),
        diagnostics: JSON.parse(
          JSON.stringify({
            ...diagnostics,
            error: undefined,
            preparation,
            steps: [
              ...(diagnostics.steps ?? []),
              { message, timestamp: event.timestamp, status: 'done' },
            ],
          }),
        ),
        auditEvents: [
          ...(Array.isArray(account.auditEvents) ? account.auditEvents : []),
          event,
        ],
      },
    });
  }

  private async recordFailure(
    account: WarmupAccount,
    actorUserId: string,
    action: string,
  ): Promise<void> {
    const { organizationId } = warmupScope(account);
    const id = account.id;
    await this.prisma.$transaction(async (tx) => {
      await lockWarmup(tx, id);
      const current = await tx.warmupAccount.findFirst({
        where: { id, organizationId, isDeleted: false },
      });
      if (
        !current ||
        current.status === 'CLAIMED' ||
        current.status === 'ARCHIVED'
      )
        return;
      const message = `Warm-up ${action} failed; completed resources were preserved. Inspect the step and retry repair.`;
      await tx.warmupAccount.update({
        where: { id, organizationId: current.organizationId, isDeleted: false },
        data: {
          diagnostics: {
            ...(current.diagnostics as Prisma.JsonObject),
            error: message,
          },
          auditEvents: [
            ...(Array.isArray(current.auditEvents) ? current.auditEvents : []),
            { actorUserId, message, timestamp: new Date().toISOString() },
          ],
        },
      });
    });
  }
}

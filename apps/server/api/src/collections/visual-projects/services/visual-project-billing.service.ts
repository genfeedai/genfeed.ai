import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { VisualProjectRendererClientService } from '@api/collections/visual-projects/services/visual-project-renderer-client.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentModelAccessService } from '@api/services/agent-orchestrator/agent-model-access.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  VISUAL_CODE_DEFAULT_SETTINGS,
  VISUAL_CODE_INSPECTION_PROMPT,
  VISUAL_CODE_LIMITS,
  VISUAL_CODE_RENDERER_VERSION,
} from '@genfeedai/contracts/constants';
import type {
  IVisualCodeCatalog,
  IVisualCodeCatalogModel,
  IVisualCodeOutputRequest,
  IVisualCodeQuoteSnapshot,
  IVisualCodeReceipt,
  IVisualCodeSettings,
} from '@genfeedai/contracts/interfaces';
import { toPrismaJson, type VisualRevision } from '@genfeedai/prisma';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class VisualProjectBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsUtilsService,
    private readonly registry: AgentChatModelRegistryService,
    private readonly access: AgentModelAccessService,
    private readonly dispatcher: LlmDispatcherService,
    private readonly renderer: VisualProjectRendererClientService,
  ) {}
  async resolveModel(organizationId: string, explicit?: string) {
    const rows = await this.registry.listSelectable();
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
      select: { id: true },
    });
    if (!organization)
      throw new ForbiddenException('visual_organization_unavailable');
    const settings = await this.prisma.organizationSetting.findFirst({
      where: { organizationId },
      select: { defaultModel: true },
    });
    const models = await this.prisma.model.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        OR: [{ organizationId: null }, { organizationId }],
        key: { in: rows.map((row) => row.key) },
      },
      select: {
        id: true,
        key: true,
        capabilities: true,
        recommendedFor: true,
        supportsFeatures: true,
      },
    });
    const configured = models.find(
      (model) =>
        model.id === settings?.defaultModel ||
        model.key === settings?.defaultModel,
    )?.key;
    const requested =
      explicit ?? configured ?? (await this.registry.getDefaultModelKey());
    const key = await this.access.enforceModel(organizationId, requested);
    if (explicit && key !== explicit)
      throw new ForbiddenException('visual_model_not_entitled');
    const row = rows.find((model) => model.key === key);
    const model = models.find((value) => value.key === key);
    if (
      !row ||
      !model ||
      !row.pricing ||
      ![row.pricing.promptPerMillion, row.pricing.completionPerMillion].every(
        (value) => Number.isFinite(value) && value >= 0,
      )
    )
      throw new BadRequestException('visual_model_unpriced_or_unavailable');
    const route = await this.dispatcher.getCompletionRoute(key, organizationId);
    if (!route.isAvailable)
      throw new BadRequestException('visual_model_route_unavailable');
    const isByok = route.isByok;
    const inspectionCapability = [
      ...model.capabilities,
      ...model.recommendedFor,
      ...model.supportsFeatures,
    ].some((value) =>
      ['image-input', 'image_input', 'multimodal', 'vision'].includes(value),
    )
      ? ('declared' as const)
      : ('unknown' as const);
    return { row, isByok, inspectionCapability, route };
  }
  async catalog(organizationId: string): Promise<IVisualCodeCatalog> {
    const runtime = await this.renderer.availability();
    const models: IVisualCodeCatalogModel[] = [];
    let defaultModelKey: string | null = null;
    try {
      defaultModelKey = (await this.resolveModel(organizationId)).row.key;
    } catch {}
    const active = await this.prisma.model.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        OR: [{ organizationId: null }, { organizationId }],
      },
      select: { key: true },
    });
    const activeKeys = new Set(active.map((model) => model.key));
    for (const row of await this.registry.listSelectable()) {
      if (!activeKeys.has(row.key)) continue;
      if ((await this.access.enforceModel(organizationId, row.key)) !== row.key)
        continue;
      try {
        const resolved = await this.resolveModel(organizationId, row.key);
        models.push({
          key: row.key,
          label: row.label,
          provider: row.provider,
          isDefault: row.key === defaultModelKey,
          isByok: resolved.isByok,
          isAvailable: true,
          unavailableReason:
            resolved.inspectionCapability === 'unknown'
              ? 'vision_support_unverified'
              : null,
          inspectionCapability: resolved.inspectionCapability,
          inputCostPerMillion: row.pricing?.promptPerMillion ?? null,
          outputCostPerMillion: row.pricing?.completionPerMillion ?? null,
        });
      } catch {
        models.push({
          key: row.key,
          label: row.label,
          provider: row.provider,
          isDefault: false,
          isByok: false,
          isAvailable: false,
          unavailableReason: 'visual_model_unpriced_or_unavailable',
          inspectionCapability: 'unknown',
          inputCostPerMillion: null,
          outputCostPerMillion: null,
        });
      }
    }
    return {
      ...runtime,
      rendererVersion: VISUAL_CODE_RENDERER_VERSION,
      defaultModelKey,
      models,
      defaultSettings: VISUAL_CODE_DEFAULT_SETTINGS,
      outputFormats: ['mp4', 'png', 'jpeg'],
      limits: {
        maxSourceBytes: VISUAL_CODE_LIMITS.sourceBytes,
        maxPromptBytes: VISUAL_CODE_LIMITS.promptBytes,
        maxPropsBytes: VISUAL_CODE_LIMITS.propsBytes,
        maxAssets: 12,
        maxOutputs: 8,
        maxWidth: 1920,
        maxHeight: 1920,
        maxPixels: 1920 * 1080,
        maxDurationFrames: 900,
        maxDurationSeconds: 30,
        allowedFps: [24, 30],
        maxRepairs: 2,
        renderDeadlineSeconds: 120,
      },
    };
  }
  async quote(
    organizationId: string,
    modelKey: string | undefined,
    isAuthoring: boolean,
    settings: IVisualCodeSettings,
    outputRequests: IVisualCodeOutputRequest[],
  ): Promise<IVisualCodeQuoteSnapshot> {
    const runtime = await this.renderer.availability();
    if (!runtime.isAvailable || runtime.creditsPerSecond === null)
      throw new ServiceUnavailableException('visual_code_renderer_unavailable');
    const selected = await this.resolveModel(organizationId, modelKey);
    const pricing = selected.row.pricing;
    if (!pricing) throw new BadRequestException('visual_model_unpriced');
    const authorBound = this.registry.toRoundCredits(
      (328 * 1024 * pricing.promptPerMillion +
        16_000 * pricing.completionPerMillion) /
        1_000_000,
    );
    const inspectionBound = this.registry.toRoundCredits(
      ((3 * 4096 + Buffer.byteLength(VISUAL_CODE_INSPECTION_PROMPT)) *
        pricing.promptPerMillion +
        1024 * pricing.completionPerMillion) /
        1_000_000,
    );
    const maximumAuthoringCalls = isAuthoring ? 3 : 0;
    const maximumInspectionCalls = isAuthoring ? 3 : 1;
    const maximumRenderJobs = isAuthoring ? 4 : 2;
    const authoringCredits = selected.isByok
      ? 0
      : maximumAuthoringCalls * authorBound;
    const inspectionCredits = selected.isByok
      ? 0
      : maximumInspectionCalls * inspectionBound;
    const renderCredits = maximumRenderJobs * 120 * runtime.creditsPerSecond;
    return {
      provider: selected.route.provider,
      inputCostPerMillion: selected.isByok ? 0 : pricing.promptPerMillion,
      outputCostPerMillion: selected.isByok ? 0 : pricing.completionPerMillion,
      unit: 'credits',
      modelKey: selected.row.key,
      isByok: selected.isByok,
      authoringCredits,
      inspectionCredits,
      renderCredits,
      maximumCredits: authoringCredits + inspectionCredits + renderCredits,
      maximumAuthoringCalls,
      maximumInspectionCalls,
      maximumRepairs: isAuthoring ? 2 : 0,
      maximumRenderJobs,
      renderDeadlineSeconds: 120,
      rendererVersion: VISUAL_CODE_RENDERER_VERSION,
      creditsPerSecond: runtime.creditsPerSecond,
      settings,
      outputRequests,
    };
  }
  quoteReceipt(quote: IVisualCodeQuoteSnapshot): IVisualCodeReceipt {
    return {
      id: 'quote',
      kind: 'quote',
      state: 'confirmed',
      boundCredits: 0,
      isResultApplied: true,
      credits: 0,
      operatorCredits: 0,
      quote,
    };
  }
  async validateSnapshot(
    revision: VisualRevision,
  ): Promise<IVisualCodeQuoteSnapshot> {
    const entries = revision.receipts as unknown as IVisualCodeReceipt[];
    const snapshot = entries.find((entry) => entry.kind === 'quote')?.quote;
    if (!snapshot) throw new BadRequestException('visual_quote_unavailable');
    const current = await this.quote(
      revision.organizationId,
      snapshot.modelKey,
      snapshot.maximumAuthoringCalls > 0,
      snapshot.settings,
      snapshot.outputRequests,
    );
    for (const key of [
      'modelKey',
      'provider',
      'isByok',
      'rendererVersion',
      'creditsPerSecond',
      'inputCostPerMillion',
      'outputCostPerMillion',
    ] as const) {
      if (current[key] !== snapshot[key])
        throw new BadRequestException('quote_changed');
    }
    if (snapshot.maximumCredits > 0) {
      const hold = await this.ownedReservation(revision);
      if (
        hold?.status !== 'RESERVED' ||
        hold.expiresAt <= new Date() ||
        Number(hold.amount) !== revision.maximumCredits
      )
        throw new BadRequestException('visual_reservation_unavailable');
    }
    return snapshot;
  }
  private async ownedReservation(revision: VisualRevision) {
    if (!revision.reservationId) return null;
    return this.prisma.creditReservation.findFirst({
      where: {
        id: revision.reservationId,
        organizationId: revision.organizationId,
        actorUserId: revision.userId,
        workloadType: 'visual-code',
        workloadId: revision.id,
        idempotencyKey: `visual-code-${revision.id}`,
        isDeleted: false,
      },
    });
  }
  private async reconcileReleasedHold(
    revision: VisualRevision,
    assertOwnership: () => Promise<void>,
  ): Promise<VisualRevision> {
    const entries = revision.receipts as unknown as IVisualCodeReceipt[];
    const quote = entries.find((entry) => entry.kind === 'quote')?.quote;
    if (!quote) throw new BadRequestException('visual_quote_unavailable');
    if (quote.maximumCredits === 0) return revision;
    if (!revision.reservationId) {
      if (revision.consumedCredits > 0)
        throw new ServiceUnavailableException('visual_reservation_unavailable');
      return revision;
    }
    const hold = await this.ownedReservation(revision);
    if (!hold)
      throw new ServiceUnavailableException('visual_reservation_unavailable');
    if (hold.status !== 'RELEASED' && hold.status !== 'EXPIRED')
      return revision;
    const next = entries.map((entry) =>
      entry.state === 'confirmed' &&
      !['quote', 'settlement', 'admission'].includes(entry.kind)
        ? {
            ...entry,
            credits: 0,
            operatorCredits: entry.operatorCredits + entry.credits,
          }
        : entry,
    );
    await assertOwnership();
    const updated = await this.prisma.visualRevision.updateMany({
      where: {
        id: revision.id,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        isDeleted: false,
        receipts: { equals: toPrismaJson(entries) },
      },
      data: { receipts: toPrismaJson(next), consumedCredits: 0 },
    });
    if (updated.count !== 1)
      throw new ServiceUnavailableException(
        'visual_reconciliation_retry_required',
      );
    return this.prisma.visualRevision.findFirstOrThrow({
      where: {
        id: revision.id,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        isDeleted: false,
      },
    });
  }
  async reserve(revision: VisualRevision): Promise<string | null> {
    const snapshot = (
      revision.receipts as unknown as IVisualCodeReceipt[]
    ).find((entry) => entry.kind === 'quote')?.quote;
    if (!snapshot) throw new BadRequestException('visual_quote_unavailable');
    if (snapshot.maximumCredits === 0) return null;
    const reservation = await this.credits.reserveCredits({
      organizationId: revision.organizationId,
      actorUserId: revision.userId,
      amount: revision.maximumCredits,
      idempotencyKey: `visual-code-${revision.id}`,
      workloadType: 'visual-code',
      workloadId: revision.id,
    });
    return reservation.id;
  }
  async settle(
    revision: VisualRevision,
    assertOwnership: () => Promise<void> = async () => {},
  ): Promise<void> {
    await assertOwnership();
    const entries = revision.receipts as unknown as IVisualCodeReceipt[];
    if (entries.some((entry) => entry.kind === 'settlement')) return;
    revision = await this.reconcileReleasedHold(revision, assertOwnership);
    const isFree =
      entries.find((entry) => entry.kind === 'quote')?.quote?.maximumCredits ===
      0;
    if (!isFree && revision.reservationId && revision.consumedCredits > 0)
      await this.credits.settleReservation({
        organizationId: revision.organizationId,
        actorUserId: revision.userId,
        reservationId: revision.reservationId,
        actualAmount: Math.min(
          revision.maximumCredits,
          revision.consumedCredits,
        ),
        description: 'Visual code authoring, inspection and rendering',
        metadata: { revisionId: revision.id, projectId: revision.projectId },
      });
    else if (!isFree && revision.reservationId)
      await this.credits.releaseReservation({
        organizationId: revision.organizationId,
        reservationId: revision.reservationId,
        reason: 'release',
      });
    for (let attempt = 0; attempt < 4; attempt++) {
      const scope = {
        id: revision.id,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        isDeleted: false,
      };
      const current = await this.prisma.visualRevision.findFirstOrThrow({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
        },
      });
      const prior = current.receipts as unknown as IVisualCodeReceipt[];
      if (prior.some((entry) => entry.kind === 'settlement')) return;
      const marker: IVisualCodeReceipt = {
        id: 'settlement',
        kind: 'settlement',
        state: 'confirmed',
        boundCredits: 0,
        isResultApplied: true,
        credits: 0,
        operatorCredits: 0,
      };
      await assertOwnership();
      const written = await this.prisma.visualRevision.updateMany({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
          receipts: { equals: toPrismaJson(prior) },
        },
        data: { receipts: toPrismaJson([...prior, marker]) },
      });
      if (written.count === 1) return;
    }
    throw new ServiceUnavailableException('visual_settlement_retry_required');
  }
  async recoverReservation(
    revision: VisualRevision,
    assertOwnership: () => Promise<void> = async () => {},
  ): Promise<VisualRevision> {
    const entries = revision.receipts as unknown as IVisualCodeReceipt[];
    const quote = entries.find((entry) => entry.kind === 'quote')?.quote;
    if (!quote) throw new BadRequestException('visual_quote_unavailable');
    let reservationId = revision.reservationId;
    if (quote.maximumCredits !== 0 && !reservationId) {
      if (
        entries.some(
          (entry) => entry.kind === 'admission' && entry.state === 'started',
        )
      ) {
        reservationId = await this.reserve(revision);
      } else {
        const reservation = await this.prisma.creditReservation.findFirst({
          where: {
            organizationId: revision.organizationId,
            actorUserId: revision.userId,
            workloadType: 'visual-code',
            workloadId: revision.id,
            idempotencyKey: `visual-code-${revision.id}`,
            isDeleted: false,
          },
        });
        reservationId = reservation?.id ?? null;
      }
    }
    if (reservationId === revision.reservationId) return revision;
    await assertOwnership();
    const written = await this.prisma.visualRevision.updateMany({
      where: {
        id: revision.id,
        organizationId: revision.organizationId,
        brandId: revision.brandId,
        isDeleted: false,
        receipts: { equals: toPrismaJson(entries) },
        reservationId: revision.reservationId,
      },
      data: { reservationId },
    });
    if (written.count !== 1)
      throw new ServiceUnavailableException(
        'visual_reservation_recovery_retry_required',
      );
    return { ...revision, reservationId };
  }
  async reconcileStopped(
    revision: VisualRevision,
    assertOwnership: () => Promise<void> = async () => {},
  ): Promise<void> {
    await assertOwnership();
    const scope = {
      id: revision.id,
      organizationId: revision.organizationId,
      brandId: revision.brandId,
      isDeleted: false,
    };
    const entries = revision.receipts as unknown as IVisualCodeReceipt[];
    const quote = entries.find((entry) => entry.kind === 'quote')?.quote;
    if (!quote) throw new BadRequestException('visual_quote_unavailable');
    revision = await this.recoverReservation(revision, assertOwnership);
    const reservationId = revision.reservationId;
    let consumedCredits = entries
      .filter(
        (entry) => !['quote', 'settlement', 'admission'].includes(entry.kind),
      )
      .reduce((sum, entry) => sum + entry.credits, 0);
    const next: IVisualCodeReceipt[] = [];
    for (const entry of entries) {
      if (entry.state !== 'started') {
        next.push(entry);
        continue;
      }
      if (entry.kind === 'admission') {
        next.push({ ...entry, state: 'confirmed', isResultApplied: true });
        continue;
      }
      if (entry.kind !== 'render') {
        next.push({
          ...entry,
          state: 'indeterminate',
          operatorCredits: entry.boundCredits,
        });
        continue;
      }
      const receipt = await this.renderer.recoverStopped(entry.id);
      const actual =
        receipt && !receipt.isComputeIndeterminate
          ? receipt.computeSeconds * quote.creditsPerSecond
          : 0;
      const credits = Math.min(
        actual,
        Math.max(0, revision.maximumCredits - consumedCredits),
      );
      consumedCredits += credits;
      next.push({
        ...entry,
        state: receipt?.isComputeIndeterminate ? 'indeterminate' : 'confirmed',
        credits,
        operatorCredits: receipt?.isComputeIndeterminate
          ? entry.boundCredits
          : Math.max(0, actual - credits),
        computeSeconds: receipt?.computeSeconds ?? 0,
        isResultApplied: true,
      });
    }
    await assertOwnership();
    const updated = await this.prisma.visualRevision.updateMany({
      where: {
        id: scope.id,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        isDeleted: false,
        receipts: { equals: toPrismaJson(entries) },
      },
      data: { receipts: toPrismaJson(next), consumedCredits, reservationId },
    });
    if (updated.count !== 1)
      throw new ServiceUnavailableException(
        'visual_reconciliation_retry_required',
      );
    await this.settle(
      await this.prisma.visualRevision.findFirstOrThrow({
        where: {
          id: scope.id,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
        },
      }),
      assertOwnership,
    );
  }
  async actualCredits(
    modelKey: string,
    responseModel: string | undefined,
    promptTokens: number,
    completionTokens: number,
    providerCost: number | undefined,
    isByok: boolean,
  ): Promise<number> {
    if (isByok) return 0;
    if (
      providerCost !== undefined &&
      Number.isFinite(providerCost) &&
      providerCost >= 0
    )
      return this.registry.toRoundCredits(providerCost);
    const rows = await this.registry.listSelectable();
    const row =
      rows.find((value) => value.key === responseModel) ??
      rows.find((value) => value.key === modelKey);
    if (!row?.pricing)
      throw new ServiceUnavailableException('visual_model_cost_unknown');
    return this.registry.toRoundCredits(
      (promptTokens * row.pricing.promptPerMillion +
        completionTokens * row.pricing.completionPerMillion) /
        1_000_000,
    );
  }
}

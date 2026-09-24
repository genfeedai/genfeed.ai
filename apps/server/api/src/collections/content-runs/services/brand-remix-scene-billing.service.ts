import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import type { BrandRemixSceneQuote } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixSceneBillingService {
  constructor(private readonly credits: CreditsUtilsService, private readonly store: BrandRemixSceneStoreService) {}
  key(runId: string, operationId: string, line: BrandRemixSceneQuote['items'][number]): string { return `remix-${runId}-${operationId}-${line.key}`; }
  async reserve(organizationId: string, runId: string, operationId: string, line: BrandRemixSceneQuote['items'][number], imageReservationId?: string) {
    const { config } = await this.store.fence(organizationId, runId, operationId);
    const pipeline = config.scenePipeline;
    if (!pipeline?.operation) throw new ConflictException('Missing operation.');
    const key = this.key(runId, operationId, line);
    if (!imageReservationId && line.credits > 0) await this.credits.reserveCredits({ organizationId, actorUserId: pipeline.operation.userId, amount: line.credits, idempotencyKey: key, workloadType: 'brand-remix-scene', workloadId: key, expiresAt: new Date(Date.now() + 8 * 24 * 60 * 60_000) });
    const receiptKey = imageReservationId ? `generation:${key}` : key;
    try {
    await this.store.save(organizationId, runId, config, { ...config, scenePipeline: { ...pipeline, receipts: [...pipeline.receipts.filter((receipt) => receipt.key !== receiptKey), { key: receiptKey, operationId, actorUserId: pipeline.operation.userId, amount: line.credits, billingMode: line.billingMode, state: 'reserved' }] } });
    await this.store.fence(organizationId, runId, operationId);
    } catch (error: unknown) {
      if (line.credits > 0) await this.credits.releaseReservation({ organizationId, idempotencyKey: receiptKey });
      throw error;
    }
  }
  async settle(organizationId: string, runId: string, operationId: string, line: BrandRemixSceneQuote['items'][number], image = false) {
    const { config } = await this.store.read(organizationId, runId);
    const pipeline = config.scenePipeline;
    const key = `${image ? 'generation:' : ''}${this.key(runId, operationId, line)}`;
    const actorUserId = pipeline?.receipts.find((receipt) => receipt.key === key && receipt.operationId === operationId)?.actorUserId ?? (pipeline?.operation?.id === operationId ? pipeline.operation.userId : undefined);
    if (!actorUserId) throw new ConflictException('Missing durable settlement actor.');
    if (line.credits > 0) await this.credits.settleReservation({ organizationId, actorUserId, idempotencyKey: key, actualAmount: line.credits, description: `Remix ${line.stage}` });
    const current = await this.store.read(organizationId, runId);
    if (!current.config.scenePipeline) return;
    await this.store.save(organizationId, runId, current.config, { ...current.config, scenePipeline: { ...current.config.scenePipeline, receipts: current.config.scenePipeline.receipts.map((receipt) => receipt.key === key ? { ...receipt, state: 'settled' } : receipt) } });
  }
  async releaseImageReservation(organizationId: string, reservationId: string) {
    await this.credits.releaseReservation({ organizationId, reservationId });
  }
  async release(organizationId: string, runId: string, operationId: string, line: BrandRemixSceneQuote['items'][number]) {
    const key = this.key(runId, operationId, line);
    const { config } = await this.store.read(organizationId, runId);
    const pipeline = config.scenePipeline;
    if (!pipeline?.receipts.some((receipt) => receipt.key === key && receipt.state === 'reserved')) return;
    if (line.credits > 0) await this.credits.releaseReservation({ organizationId, idempotencyKey: key });
    await this.store.save(organizationId, runId, config, { ...config, scenePipeline: { ...pipeline, receipts: pipeline.receipts.map((receipt) => receipt.key === key ? { ...receipt, state: 'released' } : receipt) } });
  }

}

import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import type { BrandRemixSceneQuote } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixSceneBillingService {
  constructor(private readonly credits: CreditsUtilsService, private readonly store: BrandRemixSceneStoreService) {}
  key(runId: string, line: BrandRemixSceneQuote['items'][number]): string { return `remix-${runId}-${line.key}`; }
  async reserve(organizationId: string, runId: string, operationId: string, line: BrandRemixSceneQuote['items'][number], imageReservationId?: string) {
    const { config } = await this.store.fence(organizationId, runId, operationId);
    const pipeline = config.scenePipeline;
    if (!pipeline?.operation) throw new ConflictException('Missing operation.');
    const key = this.key(runId, line);
    if (!imageReservationId && line.credits > 0) await this.credits.reserveCredits({ organizationId, actorUserId: pipeline.operation.userId, amount: line.credits, idempotencyKey: key, workloadType: 'brand-remix-scene', workloadId: key, expiresAt: new Date(Date.now() + 8 * 24 * 60 * 60_000) });
    const receiptKey = imageReservationId ? `generation:${key}` : key;
    await this.store.save(organizationId, runId, config, { ...config, scenePipeline: { ...pipeline, receipts: [...pipeline.receipts.filter((receipt) => receipt.key !== receiptKey), { key: receiptKey, amount: line.credits, billingMode: line.billingMode, state: 'reserved' }] } });
    await this.store.fence(organizationId, runId, operationId);
  }
  async settle(organizationId: string, runId: string, operationId: string, line: BrandRemixSceneQuote['items'][number], image = false) {
    const { config } = await this.store.read(organizationId, runId);
    const pipeline = config.scenePipeline;
    if (!pipeline?.operation || pipeline.operation.id !== operationId) throw new ConflictException('Missing settlement actor.');
    const key = `${image ? 'generation:' : ''}${this.key(runId, line)}`;
    if (line.credits > 0) await this.credits.settleReservation({ organizationId, actorUserId: pipeline.operation.userId, idempotencyKey: key, actualAmount: line.credits, description: `Remix ${line.stage}` });
    const current = await this.store.read(organizationId, runId);
    if (!current.config.scenePipeline) return;
    await this.store.save(organizationId, runId, current.config, { ...current.config, scenePipeline: { ...current.config.scenePipeline, receipts: current.config.scenePipeline.receipts.map((receipt) => receipt.key === key ? { ...receipt, state: 'settled' } : receipt) } });
  }
}

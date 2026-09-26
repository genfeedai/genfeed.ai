import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import type { BrandRemixSceneQuote } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixSceneBillingService {
  constructor(
    private readonly credits: CreditsUtilsService,
    private readonly store: BrandRemixSceneStoreService,
  ) {}
  key(
    runId: string,
    operationId: string,
    line: BrandRemixSceneQuote['items'][number],
  ): string {
    return `remix-${runId}-${operationId}-${line.key}`;
  }
  async reserve(
    organizationId: string,
    runId: string,
    operationId: string,
    line: BrandRemixSceneQuote['items'][number],
    imageReservationId?: string,
  ) {
    const { config } = await this.store.fence(
      organizationId,
      runId,
      operationId,
    );
    const pipeline = config.scenePipeline;
    if (!pipeline?.operation) throw new ConflictException('Missing operation.');
    const key = this.key(runId, operationId, line);
    if (!imageReservationId && line.credits > 0)
      await this.credits.reserveCredits({
        organizationId,
        actorUserId: pipeline.operation.userId,
        amount: line.credits,
        idempotencyKey: key,
        workloadType: 'brand-remix-scene',
        workloadId: key,
        expiresAt: new Date(Date.now() + 8 * 24 * 60 * 60_000),
      });
    const receiptKey = imageReservationId ? `generation:${key}` : key;
    try {
      await this.store.save(organizationId, runId, config, {
        ...config,
        scenePipeline: {
          ...pipeline,
          receipts: [
            ...pipeline.receipts.filter(
              (receipt) => receipt.key !== receiptKey,
            ),
            {
              key: receiptKey,
              operationId,
              actorUserId: pipeline.operation.userId,
              amount: line.credits,
              billingMode: line.billingMode,
              state: 'reserved',
            },
          ],
        },
      });
      await this.store.fence(organizationId, runId, operationId);
    } catch (error: unknown) {
      if (line.credits > 0)
        await this.credits.releaseReservation({
          organizationId,
          idempotencyKey: receiptKey,
        });
      throw error;
    }
  }
  /**
   * Charge an accepted stage once its provider output is usable. Settlement is
   * idempotent per key; a hold that expired or was released before the output
   * arrived is recorded as released rather than charged again.
   */
  async settle(
    organizationId: string,
    runId: string,
    operationId: string,
    line: BrandRemixSceneQuote['items'][number],
    image = false,
  ) {
    const { config } = await this.store.read(organizationId, runId);
    const pipeline = config.scenePipeline;
    const key = this.receiptKey(runId, operationId, line, image);
    const receipt = pipeline?.receipts.find(
      (candidate) =>
        candidate.key === key && candidate.operationId === operationId,
    );
    if (receipt?.state === 'settled' || receipt?.state === 'released') return;
    const actorUserId =
      receipt?.actorUserId ??
      (pipeline?.operation?.id === operationId
        ? pipeline.operation.userId
        : undefined);
    if (!actorUserId)
      throw new ConflictException('Missing durable settlement actor.');
    let state: 'settled' | 'released' = 'settled';
    if (line.credits > 0) {
      try {
        await this.credits.settleReservation({
          organizationId,
          actorUserId,
          idempotencyKey: key,
          actualAmount: line.credits,
          description: `Remix ${line.stage}`,
        });
      } catch (error: unknown) {
        if (!(error instanceof UnsettleableReservationException)) throw error;
        state = 'released';
      }
    }
    await this.writeReceipt(organizationId, runId, key, state);
  }
  /**
   * Return the hold of a stage whose provider output definitively failed or
   * never reached a provider. Already settled stages stay charged.
   */
  async release(
    organizationId: string,
    runId: string,
    operationId: string,
    line: BrandRemixSceneQuote['items'][number],
    image = false,
  ) {
    const key = this.receiptKey(runId, operationId, line, image);
    const { config } = await this.store.read(organizationId, runId);
    if (
      !config.scenePipeline?.receipts.some(
        (receipt) => receipt.key === key && receipt.state === 'reserved',
      )
    )
      return;
    if (line.credits > 0)
      await this.credits.releaseReservation({
        organizationId,
        idempotencyKey: key,
      });
    await this.writeReceipt(organizationId, runId, key, 'released');
  }
  private receiptKey(
    runId: string,
    operationId: string,
    line: BrandRemixSceneQuote['items'][number],
    image: boolean,
  ) {
    return `${image ? 'generation:' : ''}${this.key(runId, operationId, line)}`;
  }
  private async writeReceipt(
    organizationId: string,
    runId: string,
    key: string,
    state: 'settled' | 'released',
  ) {
    const { config } = await this.store.read(organizationId, runId);
    if (!config.scenePipeline) return;
    await this.store.save(organizationId, runId, config, {
      ...config,
      scenePipeline: {
        ...config.scenePipeline,
        receipts: config.scenePipeline.receipts.map((receipt) =>
          receipt.key === key ? { ...receipt, state } : receipt,
        ),
      },
    });
  }
  async releaseImageReservation(organizationId: string, reservationId: string) {
    await this.credits.releaseReservation({ organizationId, reservationId });
  }
}

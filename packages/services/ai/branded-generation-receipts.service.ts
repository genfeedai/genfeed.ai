import { brandIdentitySnapshotV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import {
  brandedGenerationPromptInspectionV1Schema,
  brandedGenerationReceiptReadV1Schema,
  brandedGenerationReceiptRevisionReadV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-receipt-read.contract';
import {
  learningContractHashSchema,
  learningContractIdSchema,
} from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  BrandedGenerationPromptInspectionV1,
  BrandedGenerationReceiptHistoryQueryV1,
  BrandedGenerationReceiptListQueryV1,
  BrandedGenerationReceiptReadPageV1,
  BrandedGenerationReceiptReadV1,
  BrandedGenerationReceiptRevisionReadPageV1,
  BrandedGenerationReceiptRevisionReadV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation-receipt-read.interface';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { z } from 'zod';

const identityPreviewAttributesSchema = z.strictObject({
  snapshot: brandIdentitySnapshotV1Schema,
  source: z.enum(['current_approved_revision', 'receipt_snapshot']),
});
const identityPreviewSchema = identityPreviewAttributesSchema.extend({
  id: learningContractHashSchema,
});
export type BrandIdentityPreviewResult = z.infer<typeof identityPreviewSchema>;

const cursorSchema = z
  .object({
    hasMore: z.boolean(),
    limit: z.number().int().min(1).max(10),
    nextCursor: z.string().min(1).max(2112).nullable(),
  })
  .refine((v) => v.hasMore === (v.nextCursor !== null));
function validated<T>(read: () => T): T {
  try {
    return read();
  } catch {
    throw new Error('receipt_response_invalid');
  }
}
function resourceTypes(
  document: JsonApiResponseDocument,
  type: string,
  collection: boolean,
) {
  const data = document.data;
  if (collection ? !Array.isArray(data) : !data || Array.isArray(data))
    throw new Error('receipt_response_invalid');
  const resources = Array.isArray(data) ? data : [data];
  if (resources.some((resource) => !resource || resource.type !== type))
    throw new Error('receipt_response_invalid');
}
export class BrandedGenerationReceiptsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/brands`, token);
  }
  static getInstance(token: string): BrandedGenerationReceiptsService {
    return HTTPBaseService.getBaseServiceInstance(
      BrandedGenerationReceiptsService,
      token,
    ) as BrandedGenerationReceiptsService;
  }
  private route(brandId: string, receiptId?: string) {
    return `${encodeURIComponent(brandId)}/generation-receipts${receiptId === undefined ? '' : `/${encodeURIComponent(receiptId)}`}`;
  }
  async getIdentityPreview(
    organizationId: string,
    brandId: string,
    receiptId?: string,
    signal?: AbortSignal,
  ): Promise<BrandIdentityPreviewResult> {
    validated(() => {
      learningContractIdSchema.parse(organizationId);
      learningContractIdSchema.parse(brandId);
      if (receiptId !== undefined) learningContractIdSchema.parse(receiptId);
    });
    const { data } = await this.instance.get<JsonApiResponseDocument>(
      `${this.route(brandId)}/identity-preview`,
      receiptId === undefined ? { signal } : { params: { receiptId }, signal },
    );
    return validated(() => {
      resourceTypes(data, 'brand-identity-preview', false);
      const resource = data.data;
      if (!resource || Array.isArray(resource)) throw new Error();
      identityPreviewAttributesSchema.parse(resource.attributes);
      const value = identityPreviewSchema.parse(
        deserializeResource<unknown>(data),
      );
      if (
        resource.id !== value.id ||
        value.id !== value.snapshot.contentHash ||
        value.snapshot.organizationId !== organizationId ||
        value.snapshot.brandId !== brandId ||
        value.source !==
          (receiptId === undefined
            ? 'current_approved_revision'
            : 'receipt_snapshot') ||
        (receiptId === undefined && value.snapshot.approval !== 'approved')
      )
        throw new Error();
      return value;
    });
  }
  async list(
    brandId: string,
    query: BrandedGenerationReceiptListQueryV1 = {},
    signal?: AbortSignal,
  ): Promise<BrandedGenerationReceiptReadPageV1> {
    const { data } = await this.instance.get<JsonApiResponseDocument>(
      this.route(brandId),
      { params: query, signal },
    );
    return validated(() => {
      resourceTypes(data, 'branded-generation-receipt', true);
      const cursor = cursorSchema.parse(data.links?.cursor);
      const items = deserializeCollection<unknown>(data).map((v) =>
        brandedGenerationReceiptReadV1Schema.parse(v),
      );
      if (items.some((v) => v.brandId !== brandId)) throw new Error();
      return { items, nextCursor: cursor.nextCursor };
    });
  }
  async get(
    brandId: string,
    receiptId: string,
    signal?: AbortSignal,
  ): Promise<BrandedGenerationReceiptReadV1> {
    const { data } = await this.instance.get<JsonApiResponseDocument>(
      this.route(brandId, receiptId),
      { signal },
    );
    return validated(() => {
      resourceTypes(data, 'branded-generation-receipt', false);
      const value = brandedGenerationReceiptReadV1Schema.parse(
        deserializeResource<unknown>(data),
      );
      if (value.id !== receiptId || value.brandId !== brandId)
        throw new Error();
      return value;
    });
  }
  async history(
    brandId: string,
    receiptId: string,
    query: BrandedGenerationReceiptHistoryQueryV1 = {},
    signal?: AbortSignal,
  ): Promise<BrandedGenerationReceiptRevisionReadPageV1> {
    const { data } = await this.instance.get<JsonApiResponseDocument>(
      `${this.route(brandId, receiptId)}/history`,
      { params: query, signal },
    );
    return validated(() => {
      resourceTypes(data, 'branded-generation-receipt-revision', true);
      const cursor = cursorSchema.parse(data.links?.cursor);
      let nextAfterRevision: number | null = null;
      if (cursor.nextCursor !== null) {
        if (
          !/^(0|[1-9][0-9]{0,9})$/.test(cursor.nextCursor) ||
          Number(cursor.nextCursor) > 2147483647
        )
          throw new Error();
        nextAfterRevision = Number(cursor.nextCursor);
      }
      const items = deserializeCollection<unknown>(data).map((v) =>
        brandedGenerationReceiptRevisionReadV1Schema.parse(v),
      );
      if (items.some((v) => v.receiptId !== receiptId || v.brandId !== brandId))
        throw new Error();
      return { items, nextAfterRevision };
    });
  }
  async getRevision(
    brandId: string,
    receiptId: string,
    revision: number,
    signal?: AbortSignal,
  ): Promise<BrandedGenerationReceiptRevisionReadV1> {
    const { data } = await this.instance.get<JsonApiResponseDocument>(
      `${this.route(brandId, receiptId)}/revisions/${revision}`,
      { signal },
    );
    return validated(() => {
      resourceTypes(data, 'branded-generation-receipt-revision', false);
      const value = brandedGenerationReceiptRevisionReadV1Schema.parse(
        deserializeResource<unknown>(data),
      );
      if (
        value.receiptId !== receiptId ||
        value.brandId !== brandId ||
        value.revision !== revision
      )
        throw new Error();
      return value;
    });
  }
  async readPrompt(
    brandId: string,
    receiptId: string,
    revision: number,
    stage: BrandedGenerationPromptInspectionV1['stage'],
    signal?: AbortSignal,
  ): Promise<BrandedGenerationPromptInspectionV1> {
    const { data } = await this.instance.get<JsonApiResponseDocument>(
      `${this.route(brandId, receiptId)}/prompts/${encodeURIComponent(stage)}`,
      { params: { revision }, signal },
    );
    return validated(() => {
      resourceTypes(data, 'branded-generation-prompt-inspection', false);
      const value = brandedGenerationPromptInspectionV1Schema.parse(
        deserializeResource<unknown>(data),
      );
      if (
        value.receiptId !== receiptId ||
        value.receiptRevision !== revision ||
        value.stage !== stage
      )
        throw new Error();
      return value;
    });
  }
}

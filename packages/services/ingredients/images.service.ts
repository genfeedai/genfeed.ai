import type { IImage } from '@genfeedai/contracts/interfaces';
import {
  CRUN_QUOTE_REASON_CODES,
  type CrunGenerationQuoteResponse,
  type CrunImageQuoteRequest,
} from '@genfeedai/contracts/interfaces/billing/crun-generation-quote.interface';
import type { IImageEditParams } from '@genfeedai/contracts/interfaces/components/image-edit.interface';
import type { ImageGenerationPayload } from '@genfeedai/contracts/interfaces/content/generation-payload.interface';
import type { Image } from '@genfeedai/models/ingredients/image.model';
import type {
  SplitFrameResult,
  SplitResponse,
} from '@genfeedai/props/studio/contact-sheet.props';
import {
  ImageEditSerializer,
  ImageGenerationSerializer,
} from '@genfeedai/serializers';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';
import { EnvironmentService } from '@services/core/environment.service';
import {
  buildInstanceKey,
  ServiceInstanceManager,
} from '@services/core/service-instance-manager';

const imageInstances = new ServiceInstanceManager<ImagesService>();

export class ImagesService extends IngredientsService<Image> {
  constructor(token: string) {
    super('images', token);
  }

  static getInstance(token: string): ImagesService {
    const key = buildInstanceKey([token, EnvironmentService.apiEndpoint]);
    const cached = imageInstances.get(ImagesService, key);
    if (cached) {
      return cached;
    }

    const instance = new ImagesService(token);
    imageInstances.set(ImagesService, key, instance);
    return instance;
  }

  public async post(
    body:
      | Partial<IImage>
      | ImageGenerationPayload
      | (CrunImageQuoteRequest & { crunQuoteId: string }),
  ) {
    const data = ImageGenerationSerializer.serialize(body);
    return await this.instance
      .post<JsonApiResponseDocument>('', data) // Empty string for root path, data as second argument
      .then((res) => this.mapOne(res.data));
  }

  public async quoteCrun(
    body: CrunImageQuoteRequest,
    signal?: AbortSignal,
  ): Promise<CrunGenerationQuoteResponse> {
    const response = await this.instance.post<unknown>('/crun-quote', body, {
      signal,
    });
    const document = response.data;
    if (
      typeof document !== 'object' ||
      document === null ||
      !('data' in document)
    )
      throw new Error('CRUN_PROVIDER_UNAVAILABLE');
    const data = document.data;
    if (
      typeof data !== 'object' ||
      data === null ||
      !('type' in data) ||
      data.type !== 'crun-generation-quote' ||
      !('id' in data) ||
      typeof data.id !== 'string' ||
      !data.id ||
      !('attributes' in data)
    )
      throw new Error('CRUN_PROVIDER_UNAVAILABLE');
    const attributes = data.attributes;
    if (typeof attributes !== 'object' || attributes === null)
      throw new Error('CRUN_PROVIDER_UNAVAILABLE');
    const value = attributes as Record<string, unknown>;
    if (value.modelKey !== body.model)
      throw new Error('CRUN_PROVIDER_UNAVAILABLE');
    if (
      value.isAvailable === true &&
      typeof value.quoteId === 'string' &&
      value.quoteId.length > 0 &&
      value.quoteId.length <= 256 &&
      typeof value.expiresAt === 'string' &&
      Number.isFinite(Date.parse(value.expiresAt)) &&
      new Date(value.expiresAt).toISOString() === value.expiresAt &&
      value.contractVersion === body.crunControls.contractVersion &&
      typeof value.credits === 'number' &&
      Number.isSafeInteger(value.credits) &&
      value.credits >= 0 &&
      (value.billingMode === 'credits' || value.billingMode === 'byok') &&
      value.reasonCode === null
    )
      return attributes as CrunGenerationQuoteResponse;
    if (
      value.isAvailable === false &&
      value.quoteId === null &&
      value.expiresAt === null &&
      value.contractVersion === null &&
      value.credits === null &&
      value.billingMode === null &&
      CRUN_QUOTE_REASON_CODES.some((code) => code === value.reasonCode)
    )
      return attributes as CrunGenerationQuoteResponse;
    throw new Error('CRUN_PROVIDER_UNAVAILABLE');
  }

  public async postUpscale(id: string, data: IImageEditParams) {
    // Serialize the data to JSON API format
    const serializedData = ImageEditSerializer.serialize(data);
    return await this.instance
      .post<JsonApiResponseDocument>(`/${id}/upscale`, serializedData)
      .then((res) => this.mapOne(res.data));
  }

  public async postReframe(id: string, data: IImageEditParams) {
    // Serialize the data to JSON API format
    const serializedData = ImageEditSerializer.serialize(data);
    return await this.instance
      .post<JsonApiResponseDocument>(`/${id}/reframe`, serializedData)
      .then((res) => this.mapOne(res.data));
  }

  /**
   * Split a contact sheet image into individual frames
   * @param id - The source image ID
   * @param gridRows - Number of rows in the grid (2-4)
   * @param gridCols - Number of columns in the grid (2-4)
   * @param borderInset - Pixels to crop inward from each cell edge (default: 10)
   * @returns Array of split frame results with IDs and URLs
   */
  public async postSplit(
    id: string,
    data: { gridRows: number; gridCols: number; borderInset?: number },
  ): Promise<SplitFrameResult[]> {
    return await this.instance
      .post<SplitResponse>(`/${id}/split`, data)
      .then((res) => res.data.data.frames);
  }
}

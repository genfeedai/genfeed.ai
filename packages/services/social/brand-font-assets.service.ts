import {
  type BrandFontAssetListQueryV1,
  type BrandFontAssetPageV1,
  type BrandFontAssetReadV1,
  brandFontAssetListQueryV1Schema,
  brandFontAssetPageV1Schema,
  brandFontAssetReadV1Schema,
} from '@genfeedai/contracts/api-types/contracts/brand-font-asset.contract';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { z } from 'zod';
export interface BrandFontUploadRequest {
  requestId: string;
  displayName?: string;
  file: File;
}
const uploadRequestSchema = z.strictObject({
  requestId: z
    .uuid()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    ),
  displayName: z.string().trim().min(1).max(256).optional(),
});
const cursorMetadataSchema = z
  .strictObject({
    hasMore: z.boolean(),
    limit: z.number().int().min(1).max(50),
    nextCursor: z.string().min(1).max(2112).nullable(),
  })
  .refine(
    (value) => value.hasMore === (value.nextCursor !== null),
    'Invalid cursor metadata',
  );
const linksSchema = z.object({ cursor: cursorMetadataSchema });
export class BrandFontAssetsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/brands`, token);
  }
  static getInstance(token: string): BrandFontAssetsService {
    return HTTPBaseService.getBaseServiceInstance(
      BrandFontAssetsService,
      token,
    );
  }
  private path(brandId: string): string {
    return `/${encodeURIComponent(brandId)}/font-assets`;
  }
  async list(
    brandId: string,
    query: BrandFontAssetListQueryV1 = {},
    signal?: AbortSignal,
  ): Promise<BrandFontAssetPageV1> {
    const params = brandFontAssetListQueryV1Schema.parse(query);
    const response = await this.instance.get<JsonApiResponseDocument>(
      this.path(brandId),
      { params, signal },
    );
    const metadata = linksSchema.parse(response.data.links).cursor;
    const items = deserializeCollection<BrandFontAssetReadV1>(response.data);
    if (
      items.length > metadata.limit ||
      (metadata.hasMore && items.length !== metadata.limit)
    )
      throw new Error('font_asset_invalid');
    return brandFontAssetPageV1Schema.parse({
      items,
      nextCursor: metadata.nextCursor,
    });
  }
  async upload(
    brandId: string,
    input: BrandFontUploadRequest,
    signal?: AbortSignal,
  ): Promise<BrandFontAssetReadV1> {
    if (input.file.size > 4194304) throw new Error('font_asset_invalid');
    const request = uploadRequestSchema.parse({
      requestId: input.requestId,
      ...(input.displayName === undefined
        ? {}
        : { displayName: input.displayName }),
    });
    const form = new FormData();
    form.append('file', input.file);
    form.append('requestId', request.requestId);
    if (request.displayName !== undefined)
      form.append('displayName', request.displayName);
    const response = await this.instance.post<JsonApiResponseDocument>(
      this.path(brandId),
      form,
      { timeout: 60000, signal },
    );
    return brandFontAssetReadV1Schema.parse(deserializeResource(response.data));
  }
  async remove(
    brandId: string,
    assetId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.instance.delete(
      `${this.path(brandId)}/${encodeURIComponent(assetId)}`,
      { signal },
    );
  }
}

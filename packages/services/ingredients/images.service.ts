import type { IImage } from '@genfeedai/interfaces';
import type { IImageEditParams } from '@genfeedai/interfaces/components/image-edit.interface';
import type { Image } from '@genfeedai/models/ingredients/image.model';
import type {
  SplitFrameResult,
  SplitResponse,
} from '@genfeedai/props/studio/contact-sheet.props';
import { ImageEditSerializer, ImageSerializer } from '@genfeedai/serializers';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';

export class ImagesService extends IngredientsService<Image> {
  private static imageInstances = new Map<string, ImagesService>();

  constructor(token: string) {
    super('images', token);
  }

  static getInstance(token: string): ImagesService {
    if (!ImagesService.imageInstances.has(token)) {
      ImagesService.imageInstances.set(token, new ImagesService(token));
    }
    return ImagesService.imageInstances.get(token)!;
  }

  public async post(body: Partial<IImage>) {
    // Use the ImageSerializer to properly serialize the data
    const data = ImageSerializer.serialize(body);
    return await this.instance
      .post<JsonApiResponseDocument>('', data) // Empty string for root path, data as second argument
      .then((res) => this.mapOne(res.data));
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

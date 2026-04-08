import {
  AvatarSerializer,
  ImageSerializer,
  IngredientBulkDeleteSerializer,
  IngredientSerializer,
  MetadataSerializer,
  MusicSerializer,
  VideoSerializer,
} from '@genfeedai/client/serializers';
import { IngredientCategory } from '@genfeedai/enums';
import type {
  IBulkDeleteRequest,
  IBulkDeleteResult,
  IIngredient,
  IPost,
} from '@genfeedai/interfaces';
import { Avatar } from '@models/ai/avatar.model';
import { Ingredient } from '@models/content/ingredient.model';
import { GIF } from '@models/ingredients/gif.model';
import { Image } from '@models/ingredients/image.model';
import { Music } from '@models/ingredients/music.model';
import { Video } from '@models/ingredients/video.model';
import { Voice } from '@models/ingredients/voice.model';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import axios from 'axios';

// Local type for model constructors (IngredientModelMap expects instances, but we need constructors)
type IngredientModelConstructorMap = {
  avatars: typeof Avatar;
  videos: typeof Video;
  images: typeof Image;
  gifs: typeof GIF;
  voices: typeof Voice;
  musics: typeof Music;
  ingredients: typeof Ingredient;
};

export class IngredientsService<
  T extends Ingredient = Ingredient,
> extends BaseService<T> {
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous map stores different IngredientsService<T> subtypes
  private static instances = new Map<string, IngredientsService<any>>();

  constructor(category: IngredientCategory | string, token: string) {
    const modelMap: IngredientModelConstructorMap = {
      avatars: Avatar,
      gifs: GIF,
      images: Image,
      ingredients: Ingredient,
      musics: Music,
      videos: Video,
      voices: Voice,
    };

    const model =
      modelMap[category as keyof IngredientModelConstructorMap] || Ingredient;

    // Pass category as the endpoint (e.g., '/videos', '/images', etc.)
    super(
      `/${category}`,
      token,
      model as new (
        partial: Partial<T>,
      ) => T,
      IngredientSerializer,
    );
  }

  /**
   * Get singleton instance for specific category and token
   * If only token is provided, defaults to 'ingredients' category
   */
  // biome-ignore lint/suspicious/noExplicitAny: factory pattern — subclasses override with concrete return types
  static getInstance<T extends Ingredient = Ingredient>(
    categoryOrToken: IngredientCategory | string,
    tokenOrUndefined?: string,
  ): any {
    // Support both signatures: getInstance(category, token) and getInstance(token)
    const category = tokenOrUndefined ? categoryOrToken : 'ingredients';
    const token = tokenOrUndefined || categoryOrToken;

    const key = `${category}:${token}`;

    if (!IngredientsService.instances.has(key)) {
      IngredientsService.instances.set(
        key,
        new IngredientsService<T>(category, token),
      );
    }

    return IngredientsService.instances.get(
      key,
    ) as unknown as IngredientsService<T>;
  }

  /**
   * Clear singleton instances
   */
  static clearInstance(category?: string, token?: string): void {
    if (category && token) {
      IngredientsService.instances.delete(`${category}:${token}`);
    } else {
      IngredientsService.instances.clear();
    }
  }

  public async post(...args: unknown[]): Promise<T> {
    if (args.length === 2 && typeof args[0] === 'string') {
      const type = args[0];
      const body = args[1] as Partial<IIngredient>;

      let data: unknown;
      switch (type) {
        case IngredientCategory.VIDEO:
          data = VideoSerializer.serialize(body);
          break;
        case IngredientCategory.IMAGE:
          data = ImageSerializer.serialize(body);
          break;
        case IngredientCategory.MUSIC:
          data = MusicSerializer.serialize(body);
          break;
        case IngredientCategory.AVATAR:
          data = AvatarSerializer.serialize(body);
          break;
        default:
          data = IngredientSerializer.serialize(body);
          break;
      }

      return await this.instance
        .post<JsonApiResponseDocument>(`/${type}`, data)
        .then((res) => this.mapOne(res.data));
    }

    // Call base post with proper typing
    const body = args[0] as Partial<T>;
    return super.post(body);
  }

  public async findChildren(id: string): Promise<T[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`${id}/children`)
      .then((res) => this.mapMany(res.data));
  }

  public async postUpload(
    formData: FormData,
    progressCallback?: (
      progress: number,
      loaded: number,
      total: number,
    ) => void,
  ): Promise<T> {
    return await this.instance
      .post<JsonApiResponseDocument>(`upload`, formData, {
        // Track upload progress
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1),
          );
          if (progressCallback) {
            progressCallback(
              percentCompleted,
              progressEvent.loaded,
              progressEvent.total || 0,
            );
          }
        },
        // Increase timeout for uploads (5 minutes)
        timeout: 300_000,
      })
      .then((res) => this.mapOne(res.data));
  }

  public async getPresignedUploadUrl(
    filename: string,
    contentType: string,
    type: string,
  ): Promise<{
    id: string;
    uploadUrl: string;
    publicUrl: string;
    s3Key: string;
    expiresIn: number;
  }> {
    return await this.instance
      .post<JsonApiResponseDocument>('upload/presigned', {
        contentType,
        filename,
        type,
      })
      .then((res) =>
        this.extractResource<{
          id: string;
          uploadUrl: string;
          publicUrl: string;
          s3Key: string;
          expiresIn: number;
        }>(res.data),
      );
  }

  public async confirmUpload(id: string): Promise<T> {
    return await this.instance
      .post<JsonApiResponseDocument>(`upload/confirm/${id}`)
      .then((res) => this.mapOne(res.data));
  }

  public async uploadDirectToS3(
    file: File,
    uploadUrl: string,
    progressCallback?: (
      progress: number,
      loaded: number,
      total: number,
    ) => void,
  ): Promise<void> {
    const onUploadProgress = (progressEvent: {
      loaded: number;
      total?: number;
    }) => {
      const percentCompleted = Math.round(
        (progressEvent.loaded * 100) / (progressEvent.total || 1),
      );

      if (progressCallback) {
        progressCallback(
          percentCompleted,
          progressEvent.loaded,
          progressEvent.total || 0,
        );
      }
    };

    // Local mode: Files service URL — POST multipart form data
    const isLocalUpload =
      uploadUrl.includes('/v1/files/upload') &&
      !uploadUrl.includes('s3.amazonaws.com');

    if (isLocalUpload) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('contentType', file.type);

      return await axios.post(uploadUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
        timeout: 300_000,
      });
    }

    // Cloud mode: PUT directly to S3 presigned URL
    return await axios.put(uploadUrl, file, {
      headers: { 'Content-Type': file.type },
      onUploadProgress,
      timeout: 300_000,
    });
  }

  public async vote(id: string, endpoint: 'vote' | 'unvote'): Promise<void> {
    await this.instance.post(`${id}/${endpoint}`).then((res) => res.data);
  }

  public async postClone(id: string): Promise<T> {
    return await this.instance
      .post<JsonApiResponseDocument>(`${id}/clone`)
      .then((res) => this.mapOne(res.data));
  }

  public async postUpscale(id: string, data: unknown): Promise<T> {
    return await this.instance
      .post<JsonApiResponseDocument>(`${id}/upscale`, data)
      .then((res) => this.mapOne(res.data));
  }

  public async patchMetadata(id: string, data: Partial<T>): Promise<T> {
    const body = MetadataSerializer.serialize(data);

    return await this.instance
      .patch<JsonApiResponseDocument>(`${id}/metadata`, body)
      .then((res) => this.mapOne(res.data));
  }

  public async refreshMetadata(id: string): Promise<T> {
    return await this.instance
      .post<JsonApiResponseDocument>(`${id}/metadata`)
      .then((res) => this.mapOne(res.data));
  }

  /**
   * Update tags for an ingredient
   * Uses dedicated /tags endpoint with data wrapper
   */
  public async patchTags(id: string, tagIds: string[]): Promise<T> {
    return await this.instance
      .patch<JsonApiResponseDocument>(`${id}/tags`, {
        data: { attributes: { tags: tagIds } },
      })
      .then((res) => this.mapOne(res.data));
  }

  public async bulkDelete(
    data: IBulkDeleteRequest,
  ): Promise<IBulkDeleteResult> {
    const body = IngredientBulkDeleteSerializer.serialize(data);
    return await this.instance
      .delete<JsonApiResponseDocument>(``, { data: body })
      .then((res) => this.extractResource<IBulkDeleteResult>(res.data));
  }

  public async getPosts(id: string): Promise<IPost[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`${id}/posts`)
      .then((res) => this.extractCollection<IPost>(res.data));
  }
}

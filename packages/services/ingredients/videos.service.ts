import type {
  ICaption,
  IIngredient,
  IPost,
  IVideo,
} from '@genfeedai/interfaces';
import type {
  IVideoEditParams,
  IVideoMergeParams,
  IVideoResizeParams,
  IVideoTextOverlayParams,
} from '@genfeedai/interfaces/components/video-operations.interface';
import {
  IngredientMergeSerializer,
  VideoCaptionSerializer,
  VideoEditSerializer,
  VideoSerializer,
} from '@genfeedai/serializers';
import { buildResourcePath } from '@helpers/formatting/url/url.helper';
import { Caption } from '@models/content/caption.model';
import type { Video } from '@models/ingredients/video.model';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';

export class VideosService extends IngredientsService<Video> {
  private static videoInstances = new Map<string, VideosService>();

  constructor(token: string) {
    super('videos', token);
  }

  static getInstance(token: string): VideosService {
    if (!VideosService.videoInstances.has(token)) {
      VideosService.videoInstances.set(token, new VideosService(token));
    }

    return VideosService.videoInstances.get(token)!;
  }

  public async post(body: Partial<IVideo>) {
    const data = VideoSerializer.serialize(body);
    return await this.instance
      .post<JsonApiResponseDocument>('', data) // Empty string for root path, data as second argument
      .then((res) => this.mapOne(res.data));
  }

  public async findVideoAllPosts(id: string) {
    return await this.instance
      .get<JsonApiResponseDocument>(buildResourcePath(id, 'posts'))
      .then((res) => this.extractCollection<IPost>(res.data));
  }

  public async postLipSync(
    body: Partial<IVideo> & { audioUrl?: string; referenceUrl?: string },
  ) {
    const data = VideoSerializer.serialize(body);
    return await this.instance
      .post<JsonApiResponseDocument>(buildResourcePath('lip-sync'), data)
      .then((res) => this.mapOne(res.data));
  }

  public async postMerge(body: IVideoMergeParams) {
    const data = IngredientMergeSerializer.serialize(body);
    return await this.instance
      .post<JsonApiResponseDocument>(buildResourcePath('merge'), data)
      .then((res) => this.mapOne(res.data));
  }

  public async postUpscale(id: string, data: IVideoEditParams) {
    const serializedData = VideoEditSerializer.serialize(data);
    return await this.instance
      .post<JsonApiResponseDocument>(
        buildResourcePath(id, 'upscale'),
        serializedData,
      )
      .then((res) => this.mapOne(res.data));
  }

  public async postResize(id: string, body: IVideoResizeParams) {
    return await this.instance
      .post<JsonApiResponseDocument>(buildResourcePath(id, 'resize'), body)
      .then((res) => this.mapOne(res.data));
  }

  public async postReverse(id: string) {
    return await this.instance
      .post<JsonApiResponseDocument>(buildResourcePath(id, 'reverse'))
      .then((res) => this.mapOne(res.data));
  }

  public async postReframe(id: string, data: IVideoEditParams) {
    const serializedData = VideoEditSerializer.serialize(data);
    return await this.instance
      .post<JsonApiResponseDocument>(
        buildResourcePath(id, 'reframe'),
        serializedData,
      )
      .then((res) => this.mapOne(res.data));
  }

  public async postPortrait(id: string) {
    return await this.instance
      .post<JsonApiResponseDocument>(buildResourcePath(id, 'portrait'))
      .then((res) => this.mapOne(res.data));
  }

  public async postMirror(id: string) {
    return await this.instance
      .post<JsonApiResponseDocument>(buildResourcePath(id, 'mirror'))
      .then((res) => this.mapOne(res.data));
  }

  public async postTrim(id: string, startTime: number, endTime: number) {
    return await this.instance
      .post<JsonApiResponseDocument>(buildResourcePath(id, 'trim'), {
        endTime,
        startTime,
      })
      .then((res) => this.mapOne(res.data));
  }

  public async findCaptions(id: string) {
    return await this.instance
      .get<JsonApiResponseDocument>(buildResourcePath(id, 'captions'))
      .then((res) =>
        this.extractCollection<Partial<ICaption>>(res.data).map(
          (item: Partial<ICaption>) => new Caption(item as ICaption),
        ),
      );
  }

  public async postCaptions(id: string, captionId: string) {
    const data = VideoCaptionSerializer.serialize({ caption: captionId });
    return await this.instance
      .post<JsonApiResponseDocument>(buildResourcePath(id, 'captions'), data)
      .then((res) => {
        const result = this.extractResource<Partial<ICaption>>(res.data);
        return new Caption(result as ICaption);
      });
  }

  public async postTextOverlay(id: string, body: IVideoTextOverlayParams) {
    return await this.instance
      .post<JsonApiResponseDocument>(
        buildResourcePath(id, 'text-overlay'),
        body,
      )
      .then((res) => this.mapOne(res.data));
  }

  public async postGif(id: string) {
    return await this.instance
      .post<JsonApiResponseDocument>(buildResourcePath(id, 'gif'))
      .then((res) => this.mapOne(res.data));
  }

  public async createAvatarVideo(data: {
    avatarId?: string;
    photoUrl?: string;
    elevenlabsVoiceId?: string;
    text?: string;
    audioUrl?: string;
    heygenVoiceId?: string;
  }): Promise<IIngredient> {
    const serializedData = VideoSerializer.serialize(data);
    return await this.instance
      .post<JsonApiResponseDocument>(
        buildResourcePath('avatar'),
        serializedData,
      )
      .then((res) => this.mapOne(res.data));
  }

  public async postBatchInterpolation(data: {
    pairs: Array<{
      startImageId: string;
      endImageId: string;
      prompt?: string;
    }>;
    modelKey: string;
    isLoopMode?: boolean;
    isMergeEnabled?: boolean;
    cameraPrompt?: string;
    duration?: number;
    format?: string;
    promptTemplate?: string;
    useTemplate?: boolean;
  }): Promise<{
    jobs: Array<{
      id: string;
      pairIndex: number;
      status: string;
    }>;
    totalJobs: number;
    batchId: string;
    isMergeEnabled: boolean;
  }> {
    return await this.instance
      .post<{
        data: {
          jobs: Array<{
            id: string;
            pairIndex: number;
            status: string;
          }>;
          totalJobs: number;
          batchId: string;
          isMergeEnabled: boolean;
        };
      }>(buildResourcePath('interpolation'), data)
      .then((res) => res.data.data);
  }
}

export class VideoViewsEntity {
  declare readonly date: string;
  declare readonly totalVideos: number;
  declare readonly totalViews: number;

  constructor(partial: Partial<VideoViewsEntity>) {
    Object.assign(this, partial);
  }
}

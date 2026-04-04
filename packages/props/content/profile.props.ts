import type { IArticle, IImage, IVideo } from '@genfeedai/interfaces';

export interface ProfileSocialLinksProps {
  handle: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
}

export interface ProfileVideosProps {
  videos: IVideo[];
}

export interface ProfileImagesProps {
  images: IImage[];
}

export interface ProfileArticlesProps {
  articles: IArticle[];
}

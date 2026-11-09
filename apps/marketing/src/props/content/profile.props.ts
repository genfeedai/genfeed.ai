import type { IImage, IVideo } from '@genfeedai/contracts/interfaces';

export interface ProfileSocialLinksProps {
  handle: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
}

export interface ProfileVideosProps {
  /** Catalog labels of the models that made these videos, by model key. */
  modelCredits?: Record<string, string>;
  videos: IVideo[];
}

export interface ProfileImagesProps {
  images: IImage[];
  /** Catalog labels of the models that made these images, by model key. */
  modelCredits?: Record<string, string>;
}

export interface ProfileMediaCreditProps {
  /** The catalog label of the model that made the item, when it is listed. */
  modelLabel?: string;
  modelKey?: string;
}

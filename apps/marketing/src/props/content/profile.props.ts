import type {
  IImage,
  IPublicBrandSocial,
  IVideo,
} from '@genfeedai/contracts/interfaces';

export interface ProfileSocialLinksProps {
  /** The creator's Genfeed handle, carried as the UTM source. */
  handle: string;
  socials?: IPublicBrandSocial[];
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
  /** The asset's id, quoted in a report so support can find it. */
  mediaId: string;
  /** The catalog label of the model that made the item, when it is listed. */
  modelLabel?: string;
  modelKey?: string;
}

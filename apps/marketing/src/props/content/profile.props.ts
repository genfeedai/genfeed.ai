import type { PublicMediaKind } from '@data/public-media';
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
  /**
   * Creator handles by brand id. The community gallery passes them so each
   * card names who made it; a profile page leaves them out.
   */
  creators?: Record<string, string>;
  /** Catalog labels of the models that made these videos, by model key. */
  modelCredits?: Record<string, string>;
  videos: IVideo[];
}

export interface ProfileImagesProps {
  /** Creator handles by brand id, as on {@link ProfileVideosProps}. */
  creators?: Record<string, string>;
  images: IImage[];
  /** Catalog labels of the models that made these images, by model key. */
  modelCredits?: Record<string, string>;
}

export interface ProfileMediaCreditProps {
  /** Who made the item; the community gallery names them. */
  creatorHandle?: string;
  /** A video's length in seconds. */
  durationSeconds?: number;
  kind: PublicMediaKind;
  /** The asset's id, quoted in a report so support can find it. */
  mediaId: string;
  /** The asset's public address, handed to the agent as the reference. */
  mediaUrl?: string;
  /** The catalog label of the model that made the item, when it is listed. */
  modelLabel?: string;
  modelKey?: string;
  /** How many people have seen the item. */
  viewCount?: number;
}

export interface GalleryViews {
  /** Fresh counts by item id, once the visit was counted. */
  counts: Record<string, number>;
  /** A ref for an item's element; the element carries `data-gallery-id`. */
  observe: (node: HTMLElement | null) => void;
}

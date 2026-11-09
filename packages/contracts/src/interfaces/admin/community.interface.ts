/**
 * Operator curation of genfeed.ai/community (#9670), one organization at a
 * time: what it shows on community and whether an operator featured it.
 */

/** A brand whose public profile is listed under community creators. */
export interface IAdminCommunityCreator {
  createdAt: string;
  /** The profile handle (`genfeed.ai/@handle`). */
  handle: string;
  id: string;
  isFeatured: boolean;
  label: string;
}

/** A public, generated image or video the community galleries show. */
export interface IAdminCommunityMedia {
  /** The brand that made it, when it has one. */
  brandId: string | null;
  createdAt: string;
  id: string;
  isFeatured: boolean;
  kind: 'image' | 'video';
  label: string;
  /** The file on the CDN, for the preview. */
  url: string | null;
}

export interface IAdminCommunityOverview {
  creators: IAdminCommunityCreator[];
  media: IAdminCommunityMedia[];
  /** Every public image and video, past the page shown. */
  mediaTotal: number;
}

export interface IAdminCommunityOverviewResponse {
  data: IAdminCommunityOverview;
}

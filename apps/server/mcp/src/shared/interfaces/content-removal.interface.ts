/** What the API reports after deleting a post, and with it the media only it used. */
export interface PostRemovalResponse {
  /** Always false: Genfeed never deletes the copy on the social network. */
  deletedOnPlatform: false;
  media: {
    deleted: string[];
    kept: { id: string; reason: 'not-editable' | 'used-by-another-post' }[];
  };
  platform: string | null;
  postId: string;
  previousStatus: string;
  publishedUrl: string | null;
  verified: { mediaGone: boolean; postGone: boolean };
}

/** What deleting one Library asset reports, read back after the delete. */
export interface AssetRemovalResponse {
  assetId: string;
  /** True when a read of the asset no longer finds it. */
  verified: boolean;
}

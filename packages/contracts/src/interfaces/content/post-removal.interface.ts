/** Why a Library asset was kept when its post was deleted. */
export type PostRemovalKeptReason = 'not-editable' | 'used-by-another-post';

/** What the API reports after deleting a post and, on request, its Library media. */
export interface PostRemovalResult {
  /** True only when the copy on the social network was deleted too. */
  deletedOnPlatform: boolean;
  media: {
    deleted: string[];
    kept: { id: string; reason: PostRemovalKeptReason }[];
  };
  platform: string | null;
  postId: string;
  previousStatus: string;
  publishedUrl: string | null;
  verified: { mediaGone: boolean; postGone: boolean };
}

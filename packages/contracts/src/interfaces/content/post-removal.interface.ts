/** Why a Library asset was kept when its post was deleted. */
export type PostRemovalKeptReason = 'not-editable' | 'used-by-another-post';

/**
 * What happened to the copy on the social network:
 * - `deleted`: the provider confirmed it is gone;
 * - `not-requested`: the caller did not ask for it, so it stays;
 * - `not-published`: the post never reached a network, so there is nothing to delete.
 */
export type PostPlatformDeletionStatus =
  | 'deleted'
  | 'not-published'
  | 'not-requested';

/** What the API reports after deleting a post and, on request, its Library media. */
export interface PostRemovalResult {
  /** True only when the copy on the social network was deleted too. */
  deletedOnPlatform: boolean;
  platformDeletion: PostPlatformDeletionStatus;
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

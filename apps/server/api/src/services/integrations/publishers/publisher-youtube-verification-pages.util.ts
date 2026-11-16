import type { ProviderVerificationItem } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import {
  verificationArray as array,
  verificationId as id,
  verificationRecord as record,
  verificationString as string,
  verificationTimestamp as timestamp,
} from '@api/services/integrations/publishers/publisher-verification-pages.util';

/** `videos.list` accepts up to 50 ids and the playlist page holds as many. */
export const YOUTUBE_VERIFICATION_PAGE_SIZE = 50;

export interface YoutubeUploadEntry {
  videoId: string;
  uploadedAt: Date;
}

export interface YoutubeUploadsPlaylistPage {
  /** Only the entries added to the uploads playlist since the attempt began. */
  entries: YoutubeUploadEntry[];
  nextCursor: string | null;
}

/**
 * Reads one page of the channel's uploads playlist. A video is added to it when
 * it is uploaded, so the playlist time is the upload time even for a private
 * video that is scheduled to go public later.
 *
 * The playlist lists the newest upload first. The page is therefore the last
 * one worth reading when every entry on it predates the attempt, which keeps a
 * channel with a long history inside the bounded window. An entry that breaks
 * that order is evidence the assumption is wrong, so it stays unknown.
 */
export function parseYoutubeUploadsPlaylistPage(
  value: unknown,
  attemptStartedAt: Date,
): YoutubeUploadsPlaylistPage {
  const root = record(value);
  const nodes = array(root.items);
  if (nodes.length > YOUTUBE_VERIFICATION_PAGE_SIZE) {
    throw new Error('Incomplete YouTube verification pagination');
  }
  const floor = Math.floor(attemptStartedAt.getTime() / 1000) * 1000;
  const entries: YoutubeUploadEntry[] = [];
  let previousAt = Number.POSITIVE_INFINITY;
  let hasWindowEntry = false;
  for (const node of nodes) {
    const item = record(node);
    const uploadedAt = timestamp(record(item.snippet).publishedAt);
    if (uploadedAt.getTime() > previousAt) {
      throw new Error('YouTube verification order is not newest first');
    }
    previousAt = uploadedAt.getTime();
    if (uploadedAt.getTime() < floor) continue;
    hasWindowEntry = true;
    entries.push({
      uploadedAt,
      videoId: id(record(item.contentDetails).videoId),
    });
  }
  const token = root.nextPageToken;
  if (token === undefined || token === null) {
    return { entries, nextCursor: null };
  }
  if (nodes.length === 0) {
    throw new Error('Incomplete YouTube verification pagination');
  }
  if (typeof token !== 'string' || !token) {
    throw new Error('Incomplete YouTube verification cursor');
  }
  // A page with no entry since the attempt ends the search: all that follow
  // are older still.
  return { entries, nextCursor: hasWindowEntry ? token : null };
}

/**
 * Joins the uploads of the window with what `videos.list` reports for them. A
 * video the second call does not return (removed, or not yet visible) leaves
 * the evidence incomplete.
 */
export function parseYoutubeVideoVerificationItems(
  entries: YoutubeUploadEntry[],
  value: unknown,
): ProviderVerificationItem[] {
  const videos = new Map<string, Record<string, unknown>>();
  for (const node of array(record(value).items)) {
    const video = record(node);
    videos.set(id(video.id), video);
  }
  return entries.map((entry) => {
    const video = videos.get(entry.videoId);
    if (!video) throw new Error('Incomplete YouTube video evidence');
    const snippet = record(video.snippet);
    const status = record(video.status);
    return {
      createdAt: entry.uploadedAt,
      hasMedia: true,
      id: entry.videoId,
      isReply: false,
      mediaCount: 1,
      mediaKind: 'video',
      status: id(status.uploadStatus),
      text: string(snippet.description ?? ''),
      title: string(snippet.title),
      visibility: id(status.privacyStatus),
    };
  });
}

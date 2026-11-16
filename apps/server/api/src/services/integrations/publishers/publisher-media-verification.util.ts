import type {
  ProviderMediaVerificationMatch,
  ProviderVerificationItem,
  ProviderVerificationPageReader,
} from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { traced } from '@libs/tracing/traced';

const MAX_PAGES = 5;
const IMAGE_VISIBILITY_GRACE_MS = 5 * 60_000;
/** A video can still be processing long after the provider accepted it. */
const VIDEO_VISIBILITY_GRACE_MS = 30 * 60_000;

/** The caption as a provider stores it: line endings and outer blanks vary. */
function normalizeCaption(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

/**
 * Whether an uncertain publish with media landed, judged from the account's
 * recent media listing.
 *
 * The receipt of an attempt holds no container or upload id, so identity is
 * the exact caption plus the media shape (kind and carousel size), created
 * since the attempt began. That is weaker than an id, so every doubt stays
 * unknown instead of being settled:
 *
 * - more than one match, or a match that may predate the attempt;
 * - a same-kind item since the attempt began with a different caption, which
 *   may be this post under a caption the provider rewrote;
 * - the same caption on media of another shape;
 * - an empty caption, which proves nothing.
 *
 * Absence is only confirmed after the whole bounded listing is read and the
 * provider has had its processing time: video takes longer to appear than an
 * image. Thread children do not block verification: they are comments posted
 * after the parent, each with its own delivery state.
 */
export const verifyMediaPublish = traced(
  'verifyMediaPublish',
  async (
    attemptStartedAt: Date,
    readPage: ProviderVerificationPageReader,
    match: ProviderMediaVerificationMatch,
    now = new Date(),
  ): Promise<ProviderVerificationItem | null> => {
    const text = normalizeCaption(match.text);
    if (!text || match.mediaCount < 1) {
      throw new Error(
        'Provider verification lacks exact caption/media proof for this post',
      );
    }
    if (
      !Number.isFinite(attemptStartedAt.getTime()) ||
      attemptStartedAt.getTime() > now.getTime()
    ) {
      throw new Error('Invalid provider verification attempt time');
    }

    // Provider timestamps often have only second precision.
    const lowerBound = Math.floor(attemptStartedAt.getTime() / 1000) * 1000;
    const seenCursors = new Set<string>();
    const matches = new Map<string, ProviderVerificationItem>();
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
      const page = await readPage(cursor);
      for (const item of page.items) {
        if (item.createdAt.getTime() < lowerBound) continue;
        if (!item.mediaKind) {
          throw new Error('Provider verification lacks media evidence');
        }
        const isSameCaption = normalizeCaption(item.text) === text;
        const isSameShape =
          item.mediaKind === match.mediaKind &&
          (match.mediaKind !== 'carousel' ||
            item.mediaCount === match.mediaCount);
        if (!isSameCaption) {
          if (item.mediaKind === match.mediaKind) {
            throw new Error(
              'Provider verification has same-kind media with another caption',
            );
          }
          continue;
        }
        if (
          !isSameShape ||
          item.createdAt.getTime() < attemptStartedAt.getTime() ||
          item.createdAt.getTime() > now.getTime() ||
          item.isReply
        ) {
          throw new Error(
            'Provider verification has ambiguous media semantics',
          );
        }
        matches.set(item.id, item);
        if (matches.size > 1) {
          throw new Error(
            'Provider verification found ambiguous duplicate captions',
          );
        }
      }
      if (page.nextCursor === null) {
        const found = [...matches.values()][0];
        if (found) return found;
        const graceMs =
          match.mediaKind === 'video'
            ? VIDEO_VISIBILITY_GRACE_MS
            : IMAGE_VISIBILITY_GRACE_MS;
        if (now.getTime() - attemptStartedAt.getTime() < graceMs) {
          throw new Error(
            'Provider verification is within the visibility grace',
          );
        }
        return null;
      }
      if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
        throw new Error(
          'Provider verification pagination is incomplete or cyclic',
        );
      }
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new Error(
      'Provider verification pagination exceeded the bounded window',
    );
  },
);

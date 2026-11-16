import type {
  ProviderVerificationItem,
  ProviderVerificationPageReader,
} from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { traced } from '@libs/tracing/traced';

const MAX_PAGES = 5;
const VISIBILITY_GRACE_MS = 5 * 60_000;

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Whether an uncertain article publish landed, for a provider whose listing
 * returns the title and creation time but not the body.
 *
 * Identity is therefore the exact title among articles created since the
 * attempt began, in the list that matches the lifecycle the attempt asked for
 * (published or draft). That is weaker than comparing the body, so every doubt
 * stays unknown instead of being settled:
 *
 * - an empty title, which proves nothing;
 * - more than one article with the title since the attempt began;
 * - a match whose creation time may predate the attempt.
 *
 * Absence is only confirmed after the whole bounded listing is read and the
 * provider has had its visibility grace.
 */
export const verifyTitlePublish = traced(
  'verifyTitlePublish',
  async (
    attemptStartedAt: Date,
    readPage: ProviderVerificationPageReader,
    expectedTitle: string,
    now = new Date(),
  ): Promise<ProviderVerificationItem | null> => {
    const title = normalizeTitle(expectedTitle);
    if (!title) {
      throw new Error('Provider verification lacks an exact title to match');
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
        if (normalizeTitle(item.title ?? '') !== title) continue;
        if (
          item.createdAt.getTime() < attemptStartedAt.getTime() ||
          item.createdAt.getTime() > now.getTime()
        ) {
          throw new Error(
            'Provider verification has ambiguous title timing proof',
          );
        }
        matches.set(item.id, item);
        if (matches.size > 1) {
          throw new Error(
            'Provider verification found ambiguous duplicate titles',
          );
        }
      }
      if (page.nextCursor === null) {
        const found = [...matches.values()][0];
        if (found) return found;
        if (now.getTime() - attemptStartedAt.getTime() < VISIBILITY_GRACE_MS) {
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

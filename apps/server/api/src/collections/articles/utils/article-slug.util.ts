import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { ConflictException } from '@nestjs/common';

/** Partial unique index over live published article slugs (SQL-only). */
export const PUBLIC_ARTICLE_SLUG_INDEX = 'articles_public_slug_uidx';

/**
 * True when `error` is Prisma's unique-constraint violation (P2002) for the
 * public article slug. Prisma reports a raw partial index by its name or by
 * its column list, so accept either.
 */
export function isPublicSlugUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const { code, meta } = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  if (code !== 'P2002') {
    return false;
  }

  const target = meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some(
    (entry) =>
      typeof entry === 'string' &&
      (entry === 'slug' || entry.includes(PUBLIC_ARTICLE_SLUG_INDEX)),
  );
}

interface PublicSlugDelegate {
  findFirst(args: {
    select: { id: true };
    where: Record<string, unknown>;
  }): Promise<unknown>;
}

/**
 * Public slugs are one global namespace (`/articles/:slug`). Reject a publish
 * whose slug another live published article already holds, so a tenant can
 * never shadow an existing page. The partial unique index
 * `articles_public_slug_uidx` is the race-proof backstop.
 */
export async function assertPublicSlugAvailable(
  delegate: PublicSlugDelegate,
  slug: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  if (!slug) {
    return;
  }

  // A published slug is unique across every organization, so the check
  // deliberately leaves the request tenant.
  const holder = await crossOrgUnsafe(
    async () =>
      await delegate.findFirst({
        select: { id: true },
        where: {
          isDeleted: false,
          slug,
          status: 'PUBLISHED',
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      }),
  );

  if (holder) {
    throw new ConflictException(
      `The slug "${slug}" is already used by a published article`,
    );
  }
}

/**
 * On an update, check the slug only when the write makes the article public
 * under a new identity: it is being published or its published slug changes.
 */
export async function assertPublishedSlugTransition(
  delegate: PublicSlugDelegate,
  id: string,
  next: { slug?: string | null; status?: string },
  current: { slug?: string | null; status?: string },
): Promise<void> {
  const status = next.status ?? current.status;
  const slug = next.slug ?? current.slug;
  if (
    status === 'PUBLISHED' &&
    (status !== current.status || slug !== current.slug)
  ) {
    await assertPublicSlugAvailable(delegate, slug, id);
  }
}

/** Maps a lost race on the public-slug unique index to the same 409. */
export async function mapPublicSlugConflict<R>(
  write: () => Promise<R>,
): Promise<R> {
  try {
    return await write();
  } catch (error: unknown) {
    if (isPublicSlugUniqueViolation(error)) {
      throw new ConflictException(
        'The slug is already used by a published article',
      );
    }
    throw error;
  }
}

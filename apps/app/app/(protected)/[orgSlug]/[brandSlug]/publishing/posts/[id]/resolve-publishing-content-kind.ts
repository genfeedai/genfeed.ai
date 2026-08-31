import type { ArtifactEditorType } from '@genfeedai/constants';

export type PublishingContentKind = ArtifactEditorType;

export type ContentLookup = {
  findOne: (
    id: string,
    query?: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<unknown>;
};

/**
 * Posts, articles, and newsletters are separate tables — there is no shared
 * `type` field on a unified content row. The Publishing desk hosts all three under
 * `/publishing/posts/:id`, so the editor is chosen by **which entity the id
 * actually belongs to**, not by a fragile `?kind=` query param.
 *
 * Lookups run in parallel; the first successful findOne wins. CUID/UUID ids
 * are unique per generation; a collision across tables is treated as
 * "prefer the first success" (stable order: post → article → newsletter).
 */
export async function resolvePublishingContentKindFromId(
  contentId: string,
  services: {
    articles: ContentLookup;
    newsletters: ContentLookup;
    posts: ContentLookup;
  },
  signal?: AbortSignal,
): Promise<PublishingContentKind | null> {
  const probes: Array<{
    kind: PublishingContentKind;
    service: ContentLookup;
  }> = [
    { kind: 'post', service: services.posts },
    { kind: 'article', service: services.articles },
    { kind: 'newsletter', service: services.newsletters },
  ];

  const results = await Promise.all(
    probes.map(async ({ kind, service }) => {
      try {
        await service.findOne(contentId, {}, signal);
        return kind;
      } catch {
        return null;
      }
    }),
  );

  for (const kind of results) {
    if (kind) {
      return kind;
    }
  }

  return null;
}

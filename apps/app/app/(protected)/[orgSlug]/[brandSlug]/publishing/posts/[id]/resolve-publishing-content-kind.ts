import type { ArtifactEditorType } from '@genfeedai/contracts/constants';
import type { ContentLookup } from '@genfeedai/props/publishing/publishing-content-editor-page.props';

export type { ContentLookup } from '@genfeedai/props/publishing/publishing-content-editor-page.props';

export type PublishingContentKind = ArtifactEditorType;

/**
 * Posts, articles, and newsletters are separate tables — there is no shared
 * `type` field on a unified content row. The Publishing desk hosts all three under
 * `/publishing/posts/:id`, so the editor is chosen by **which entity the id
 * actually belongs to**, not by a fragile `?kind=` query param.
 *
 * Lookups run in order — post → article → newsletter — and stop at the first
 * hit. Probing all three in parallel always spent two requests that could only
 * 404, and the route is `/publishing/posts/:id`, so a post is the overwhelming
 * case and now costs one request. A collision across tables keeps resolving to
 * the earliest kind in that order, exactly as before.
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

  for (const { kind, service } of probes) {
    try {
      await service.findOne(contentId, {}, signal);
      return kind;
    } catch {
      // Not this table. Try the next one.
    }
  }

  return null;
}

const TCO_LINK_PATTERN = /https?:\/\/t\.co\/[A-Za-z0-9]+/gu;
const MAX_SHORT_LINKS = 10;

export type ShortLinkResolver = (url: string) => Promise<string | undefined>;

/**
 * X wraps every link in its profile text as a `t.co` redirect, so a crawled bio
 * reads "Building https://t.co/abc". Replace each one with the URL it points to;
 * a link that cannot be resolved is left as it was.
 */
export async function expandTcoLinks(
  texts: ReadonlyArray<string | undefined>,
  resolve: ShortLinkResolver,
): Promise<Map<string, string>> {
  const links = new Set<string>();

  for (const text of texts) {
    for (const link of text?.match(TCO_LINK_PATTERN) ?? []) {
      links.add(link);
    }
  }

  const expanded = new Map<string, string>();
  const pending = [...links].slice(0, MAX_SHORT_LINKS);
  const targets = await Promise.all(
    pending.map(async (link) => {
      try {
        return await resolve(link);
      } catch {
        return undefined;
      }
    }),
  );

  pending.forEach((link, index) => {
    const target = targets[index];

    if (target) {
      expanded.set(link, target);
    }
  });

  return expanded;
}

export function replaceTcoLinks(
  text: string | undefined,
  expanded: ReadonlyMap<string, string>,
): string | undefined {
  if (!text || expanded.size === 0) {
    return text;
  }

  return text.replace(TCO_LINK_PATTERN, (link) => expanded.get(link) ?? link);
}

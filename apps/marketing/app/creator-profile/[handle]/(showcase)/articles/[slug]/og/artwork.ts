import { EnvironmentService } from '@services/core/environment.service';

/**
 * The card is drawn on this server, which fetches its `<img>` sources. Only
 * artwork on Genfeed's CDN is drawn: a cover URL is author-set, and fetching
 * any other address would let an author point this server at hosts of their
 * choosing. Other covers still show on the page and as `og:image`.
 */
export function getDrawableArtwork(
  coverImageUrl: string | null | undefined,
): string | undefined {
  const url = coverImageUrl ? URL.parse(coverImageUrl.trim()) : null;
  const cdn = URL.parse(EnvironmentService.cdnUrl);
  return url && cdn && url.origin === cdn.origin ? url.toString() : undefined;
}

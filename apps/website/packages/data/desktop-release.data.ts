/**
 * Desktop build lookup for /download.
 *
 * Desktop artifacts publish under `desktop-v*` tags with `make_latest: false`
 * (`.github/workflows/desktop-release.yml`) so a desktop build never displaces
 * the product release that `/releases/latest` resolves to. That endpoint
 * therefore cannot answer "what is the newest desktop build" — every lookup
 * here scans the release list for the newest `desktop-v*` tag instead.
 *
 * Until the first desktop tag ships, every function returns null and the page
 * renders its unreleased state. That is the correct answer, not a failure — so
 * "no release found" is deliberately not logged.
 */
import { DesktopOs } from '@genfeedai/contracts';
import { logger } from '@services/core/logger.service';

const RELEASE_OWNER = 'genfeedai';
const RELEASE_REPO = `${RELEASE_OWNER}/genfeed.ai`;
const RELEASE_TAG_PREFIX = 'desktop-v';

export const DESKTOP_RELEASES_URL = `https://github.com/${RELEASE_REPO}/releases`;

/**
 * electron-builder emits `GenFeed-${version}-${arch}.${ext}`. The release job
 * runs on `macos-latest`, which is Apple Silicon, so arm64 is the only artifact
 * that exists. An Intel build would need its own runner and appear here as a
 * second pattern rather than a looser one — matching `.dmg` alone would hand an
 * Intel visitor an arm64 image that cannot launch.
 */
const MAC_ARM64_ASSET_PATTERN = /^GenFeed-.+-arm64\.dmg$/i;

/**
 * Release lookups revalidate quickly so a freshly published build shows up
 * without a redeploy, but not per-request: the unauthenticated GitHub API
 * allows 60 calls/hour per IP and a single serverless region burns that fast.
 */
const RELEASE_REVALIDATE_SECONDS = 300;

/** The direct-download route wants the newest build within a minute of publish. */
const REDIRECT_REVALIDATE_SECONDS = 60;

/** Bounds each GitHub attempt so a stalled API call cannot hold the route open. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Caps pagination work when GitHub returns an unexpectedly long link chain. */
const MAX_RELEASE_PAGES = 10;

export interface DesktopBuild {
  /** GitHub release asset URL, validated to live under the Genfeed org. */
  downloadUrl: string;
  /** Asset size in bytes, or null when GitHub omits it. */
  fileSizeBytes: number | null;
  publishedAt: string | null;
  /** Display version with the tag prefix stripped: `desktop-v0.2.0` → `0.2.0`. */
  version: string;
}

interface IGitHubAsset {
  browser_download_url?: unknown;
  name?: unknown;
  size?: unknown;
}

interface IGitHubRelease {
  assets?: IGitHubAsset[];
  draft?: unknown;
  published_at?: unknown;
  tag_name?: unknown;
}

interface INextFetchInit extends RequestInit {
  next?: { revalidate: number };
}

const MAC_USER_AGENT = /Macintosh|Mac OS X/i;
const WINDOWS_USER_AGENT = /Windows/i;
/** Checked before the macOS pattern: iOS Safari sends "like Mac OS X". */
const MOBILE_USER_AGENT = /Android|CrOS|iPad|iPhone|iPod/i;

/**
 * The read-only slice of `Headers` this module needs. Typed structurally so a
 * route handler's `request.headers` and a server component's `await headers()`
 * both satisfy it without a cast.
 */
export interface ReadableHeaders {
  get(name: string): string | null;
}

/**
 * Client hints are authoritative when present — Chromium sends them
 * unconditionally and they survive the UA-reduction rollout that is steadily
 * hollowing out the user-agent string. The UA regexes are the fallback for
 * Safari and Firefox, which do not send platform hints at all.
 */
export function detectDesktopOs(headers: ReadableHeaders): DesktopOs {
  const platformHint = headers
    .get('sec-ch-ua-platform')
    ?.replaceAll('"', '')
    .trim()
    .toLowerCase();

  if (platformHint) {
    if (platformHint === 'macos') {
      return DesktopOs.MAC_OS;
    }

    if (platformHint === 'windows') {
      return DesktopOs.WINDOWS;
    }

    return DesktopOs.OTHER;
  }

  const userAgent = headers.get('user-agent') ?? '';

  if (MOBILE_USER_AGENT.test(userAgent)) {
    return DesktopOs.OTHER;
  }

  if (MAC_USER_AGENT.test(userAgent)) {
    return DesktopOs.MAC_OS;
  }

  if (WINDOWS_USER_AGENT.test(userAgent)) {
    return DesktopOs.WINDOWS;
  }

  /**
   * An unrecognised OS resolves to OTHER rather than defaulting to macOS. Only
   * macOS builds exist, so a wrong guess hands someone a disk image they cannot
   * open; the page always renders both platform cards, so the explicit choice
   * costs one click and is never wrong.
   *
   * iPadOS 13+ is the known blind spot: desktop-class Safari sends a Macintosh
   * user agent with no iPad token, so it reads as macOS. The cards make that
   * recoverable.
   */
  return DesktopOs.OTHER;
}

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * A rejected credential is worse than no credential here: this endpoint is
 * public, so an expired or mistyped token turns a request that would have
 * succeeded anonymously into a 401. Retrying unauthenticated keeps downloads
 * working at the 60/hour ceiling instead of sending every visitor to the
 * releases page.
 */
async function fetchGitHub(
  url: string,
  init: INextFetchInit,
): Promise<Response> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const requestUrl = new URL(url);
  const path = `${requestUrl.pathname}${requestUrl.search}`;
  const response = await fetchGitHubAttempt(url, init, token);

  if (token && (response.status === 401 || response.status === 403)) {
    logger.warn('Desktop download: GITHUB_TOKEN rejected, retrying anonymous', {
      path,
      status: response.status,
    });

    return fetchGitHubAttempt(url, init);
  }

  return response;
}

async function fetchGitHubAttempt(
  url: string,
  init: INextFetchInit,
  token?: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      headers: githubHeaders(token),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const link of linkHeader.split(',')) {
    const [targetPart, ...parameterParts] = link.split(';');
    const targetMatch = targetPart?.trim().match(/^<([^>]+)>$/);
    const relation = parameterParts
      .map((parameter) =>
        parameter.trim().match(/^rel=(?:"([^"]+)"|([^\s]+))$/i),
      )
      .find((match) => match !== null);
    const relationValue = relation?.[1] ?? relation?.[2];

    if (!targetMatch || !relationValue?.split(/\s+/).includes('next')) {
      continue;
    }

    try {
      const url = new URL(targetMatch[1]);

      return url.origin === 'https://api.github.com' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Renaming a repo makes GitHub answer the old path with a 301, so the release
 * resolves fine but its assets carry the *new* name. Pinning the full
 * `owner/repo` would fail shut on every rename; pinning the owner still rejects
 * anything hosted outside the Genfeed account.
 */
function isTrustedAssetUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(`https://github.com/${RELEASE_OWNER}/`) &&
    value.includes('/releases/download/')
  );
}

function toDesktopBuild(release: IGitHubRelease): DesktopBuild | null {
  const tagName = release.tag_name;

  if (typeof tagName !== 'string' || !tagName.startsWith(RELEASE_TAG_PREFIX)) {
    return null;
  }

  const asset = release.assets?.find(
    ({ name }) =>
      typeof name === 'string' && MAC_ARM64_ASSET_PATTERN.test(name),
  );

  if (!asset) {
    logger.warn('Desktop download: release has no macOS arm64 disk image', {
      pattern: String(MAC_ARM64_ASSET_PATTERN),
      tagName,
    });

    return null;
  }

  if (!isTrustedAssetUrl(asset.browser_download_url)) {
    logger.error('Desktop download: asset URL outside the Genfeed org', {
      downloadUrl: String(asset.browser_download_url),
      tagName,
    });

    return null;
  }

  const version = tagName.slice(RELEASE_TAG_PREFIX.length).trim();

  if (!version) {
    return null;
  }

  return {
    downloadUrl: asset.browser_download_url,
    fileSizeBytes: typeof asset.size === 'number' ? asset.size : null,
    publishedAt:
      typeof release.published_at === 'string' ? release.published_at : null,
    version,
  };
}

async function fetchLatestDesktopBuild(
  init: INextFetchInit,
): Promise<DesktopBuild | null> {
  try {
    // GitHub returns releases newest-first, so the first `desktop-v*` entry
    // that carries a usable asset is the current build.
    let pageUrl = `https://api.github.com/repos/${RELEASE_REPO}/releases?per_page=100`;

    for (let pageNumber = 1; pageNumber <= MAX_RELEASE_PAGES; pageNumber += 1) {
      const response = await fetchGitHub(pageUrl, init);

      if (!response.ok) {
        logger.warn('Desktop download: GitHub release list failed', {
          status: response.status,
          statusText: response.statusText,
        });

        return null;
      }

      const releases = (await response.json()) as IGitHubRelease[];

      if (!Array.isArray(releases)) {
        logger.warn('Desktop download: GitHub release list was not an array');

        return null;
      }

      for (const release of releases) {
        if (release.draft === true) {
          continue;
        }

        const build = toDesktopBuild(release);

        if (build) {
          return build;
        }
      }

      const nextUrl = nextPageUrl(response.headers.get('Link'));

      if (!nextUrl) {
        return null;
      }

      pageUrl = nextUrl;
    }

    return null;
  } catch (error) {
    logger.warn('Desktop download: GitHub release lookup threw', { error });

    return null;
  }
}

/** Null until the first `desktop-v*` tag ships, or when GitHub is unreachable. */
export function getLatestDesktopBuild(): Promise<DesktopBuild | null> {
  return fetchLatestDesktopBuild({
    next: { revalidate: RELEASE_REVALIDATE_SECONDS },
  });
}

function redirect(location: string): Response {
  return new Response(null, {
    headers: {
      'Cache-Control': 'private, no-store',
      Location: location,
      Vary: 'Sec-CH-UA-Platform, User-Agent',
    },
    status: 307,
  });
}

/**
 * Direct-download entry point. Falls back to the releases page whenever a real
 * artifact cannot be resolved, so the link is never dead — it just lands
 * somewhere the visitor can see for themselves what exists.
 */
export async function redirectToLatestDesktopBuild(): Promise<Response> {
  const build = await fetchLatestDesktopBuild({
    next: { revalidate: REDIRECT_REVALIDATE_SECONDS },
  });

  return redirect(build?.downloadUrl ?? DESKTOP_RELEASES_URL);
}

/** Bytes → "148 MB". Null size renders nothing rather than a fake number. */
export function formatFileSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  const megabytes = bytes / 1_000_000;

  if (megabytes >= 1_000) {
    return `${(megabytes / 1_000).toFixed(1)} GB`;
  }

  return `${Math.round(megabytes)} MB`;
}

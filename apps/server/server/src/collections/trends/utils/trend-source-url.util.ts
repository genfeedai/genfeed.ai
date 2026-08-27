export type TrendSourceUrlNormalizationResult =
  | {
      normalizedUrl: string;
      ok: true;
    }
  | {
      error: unknown;
      normalizedUrl: string;
      ok: false;
    };

function removeTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Treat the first delimiter as terminal even for malformed multi-line input.
 * This intentionally avoids retaining attacker-controlled lines after a URL.
 */
function stripQueryAndFragment(value: string): string {
  let end = value.length;

  for (const delimiter of ['?', '#']) {
    const delimiterIndex = value.indexOf(delimiter);
    if (delimiterIndex >= 0 && delimiterIndex < end) {
      end = delimiterIndex;
    }
  }

  return end === value.length ? value : value.slice(0, end);
}

export function normalizeTrendSourceUrl(
  url: string,
): TrendSourceUrlNormalizationResult {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';

    return {
      normalizedUrl: removeTrailingSlash(parsed.toString()),
      ok: true,
    };
  } catch (error) {
    return {
      error,
      normalizedUrl: removeTrailingSlash(stripQueryAndFragment(url)),
      ok: false,
    };
  }
}

// React words a mismatch as "Hydration failed…" or, for text and attribute
// differences, "Text content does not match server-rendered HTML".
const HYDRATION_PATTERN = /hydrat|does not match server-rendered/i;
// These are the production hydration codes recognized by Sentry Replay.
const MINIFIED_HYDRATION_PATTERN =
  /(?:\bMinified React error #|https?:\/\/(?:react\.dev\/errors\/|reactjs\.org\/docs\/error-decoder\.html\?invariant=))(418|419|422|423|425)\b/;
const URL_PATTERN = /https?:\/\/\S+/g;
const ELEMENT_PATTERN = /<([a-z][a-z0-9-]*)/gi;
const MAX_MESSAGE_LENGTH = 160;
const MAX_ELEMENTS = 8;

interface HydrationSentryException {
  readonly value?: string;
}

interface HydrationSentryEvent {
  exception?: {
    values?: HydrationSentryException[];
  };
  message?: string;
  tags?: Record<string, unknown>;
}

function readErrorText(event: HydrationSentryEvent): string {
  return event.exception?.values?.[0]?.value ?? event.message ?? '';
}

/** Tag the original error before send so it can be correlated with its Replay. */
export function tagHydrationErrorDetail<TEvent extends HydrationSentryEvent>(
  event: TEvent,
): TEvent & Pick<HydrationSentryEvent, 'tags'> {
  const text = readErrorText(event);

  const code = MINIFIED_HYDRATION_PATTERN.exec(text)?.[1];

  if (code) {
    // Decoder arguments can contain user content. Only copy the allowlisted code.
    return Object.assign(event, {
      tags: {
        ...event.tags,
        hydration_message: `Minified React error #${code}`,
      },
    });
  }

  if (!HYDRATION_PATTERN.test(text)) {
    return event;
  }

  const firstLine = text
    .split('\n')[0]
    .replace(URL_PATTERN, '<url>')
    .slice(0, MAX_MESSAGE_LENGTH);
  const elements = [...text.matchAll(ELEMENT_PATTERN)]
    .map((match) => match[1].toLowerCase())
    .slice(0, MAX_ELEMENTS)
    .join(',');

  return Object.assign(event, {
    tags: {
      ...event.tags,
      hydration_diff_elements: elements,
      hydration_message: firstLine,
    },
  });
}

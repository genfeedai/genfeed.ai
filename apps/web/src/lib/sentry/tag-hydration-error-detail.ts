const HYDRATION_PATTERN = /hydrat/i;
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

/**
 * Sentry scrubs the message of a "Hydration error" Replay issue, so the cause
 * of the root not-found mismatch (APP-GENFEED-AI-Q) cannot be read from the
 * issue. This copies two safe facts from the raw error into tags before it is
 * sent: its first line with URLs removed, and the element names in React's
 * mismatch diff. Text content and attribute values from the diff never leave
 * the browser.
 */
export function tagHydrationErrorDetail<TEvent extends HydrationSentryEvent>(
  event: TEvent,
): TEvent {
  const text = readErrorText(event);

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

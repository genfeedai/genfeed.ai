interface DroppableSentryFrame {
  readonly abs_path?: string;
  readonly filename?: string;
}

interface DroppableSentryEvent {
  exception?: {
    values?: Array<{
      stacktrace?: {
        frames?: DroppableSentryFrame[];
      };
    }>;
  };
}

/**
 * Frames that only exist in headless scraping runtimes (Deno-core based
 * crawlers such as Obscura), never in a visitor's browser.
 */
const NON_BROWSER_RUNTIME_FRAME = /^(ext:core\/|<obscura:)/;

function isNonBrowserRuntimeFrame(frame: DroppableSentryFrame): boolean {
  return [frame.filename, frame.abs_path].some(
    (path) => typeof path === 'string' && NON_BROWSER_RUNTIME_FRAME.test(path),
  );
}

/**
 * Drop errors raised while a headless crawler executes the marketing site
 * inside its own JavaScript runtime. Those stacks run through the crawler's
 * bootstrap rather than any page bundle, so they carry no actionable signal.
 */
export function dropNonBrowserRuntimeEvent<TEvent extends DroppableSentryEvent>(
  event: TEvent,
): TEvent | null {
  const hasNonBrowserFrame = (event.exception?.values ?? []).some((value) =>
    (value.stacktrace?.frames ?? []).some(isNonBrowserRuntimeFrame),
  );

  return hasNonBrowserFrame ? null : event;
}

type ButtonActionListener = (action: string) => void;

let listener: ButtonActionListener | null = null;

/**
 * Lets the host app observe clicks on `<Button action="…">` without the UI
 * package depending on analytics or error reporting. One listener at a time.
 */
export function setButtonActionListener(
  next: ButtonActionListener | null,
): void {
  listener = next;
}

/** Never throws: observing a click must not break the click. */
export function notifyButtonAction(action: string): void {
  try {
    listener?.(action);
  } catch {
    // Telemetry is best-effort.
  }
}

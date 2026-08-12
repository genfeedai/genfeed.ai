export const DESKTOP_WINDOW_CLOSE_POLICY = {
  HIDE_ON_CLOSE: 'hide-on-close',
  QUIT_ON_CLOSE: 'quit-on-close',
} as const;

export type DesktopWindowClosePolicy =
  (typeof DESKTOP_WINDOW_CLOSE_POLICY)[keyof typeof DESKTOP_WINDOW_CLOSE_POLICY];

interface DesktopWindowCloseEvent {
  preventDefault: () => void;
}

interface DesktopWindowCloseActions {
  hide: () => void;
  isQuitting: () => boolean;
}

interface DesktopWindowClosedActions {
  isQuitting: () => boolean;
  onClosed: () => void;
  quit: () => void;
}

export function handleDesktopWindowClose(
  policy: DesktopWindowClosePolicy,
  event: DesktopWindowCloseEvent,
  actions: DesktopWindowCloseActions,
): void {
  if (
    policy === DESKTOP_WINDOW_CLOSE_POLICY.HIDE_ON_CLOSE &&
    !actions.isQuitting()
  ) {
    event.preventDefault();
    actions.hide();
  }
}

export function handleDesktopWindowClosed(
  policy: DesktopWindowClosePolicy,
  actions: DesktopWindowClosedActions,
): void {
  actions.onClosed();

  if (
    policy === DESKTOP_WINDOW_CLOSE_POLICY.QUIT_ON_CLOSE &&
    !actions.isQuitting()
  ) {
    actions.quit();
  }
}

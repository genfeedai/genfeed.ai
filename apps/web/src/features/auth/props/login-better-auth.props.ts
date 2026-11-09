import type { AlertProps } from '@ui/primitives/alert';

export type LoginMode = 'chooser' | 'magic-link' | 'password';

export type InvitationNotice = {
  message: string;
  variant: NonNullable<AlertProps['variant']>;
};

export interface LoginBetterAuthProps {
  mode?: LoginMode;
  /**
   * Where to land after any sign-in or sign-up path. Overrides the page's own
   * `callbackUrl` param when a host page embeds the chooser (OAuth consent).
   */
  callbackURL?: string;
  /** Chooser heading overrides for an embedding page. */
  title?: string;
  description?: string;
}

/** A sign-in attempt that is in flight (#9742). */
export type LoginSubmitMethod =
  | 'magic_link'
  | 'password'
  | 'social'
  | 'desktop_code'
  | 'local';

/**
 * The surface an error belongs to. Each login page renders only its own:
 * `desktop` covers the desktop shell (system browser, session confirmation,
 * pasted code, local workspace).
 */
export type LoginErrorMethod = 'magic_link' | 'password' | 'social' | 'desktop';

/**
 * One sign-in flow at a time (#9742). Field values (email, password, desktop
 * code) stay plain state; this is only where the flow is.
 *
 * - `submitting` stays set after a success that navigates away, so the form
 *   keeps its controls locked until the next page loads.
 * - `waiting_desktop_session` shows the pasted-code form, with the last code
 *   error when there is one.
 */
export type LoginFlowState =
  | { status: 'idle' }
  | { status: 'submitting'; method: LoginSubmitMethod }
  | { status: 'link_sent' }
  | { status: 'waiting_desktop_session'; errorMessage: string | null }
  | { status: 'error'; method: LoginErrorMethod; message: string };

export type LoginFlowAction =
  | { type: 'submit'; method: LoginSubmitMethod }
  | { type: 'fail'; method: LoginErrorMethod; message: string }
  | { type: 'link_sent' }
  | { type: 'wait_for_desktop_session'; errorMessage?: string | null }
  | { type: 'desktop_bridge_ready' }
  | { type: 'reset' };

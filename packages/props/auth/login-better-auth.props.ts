import type { AlertCategory } from '@genfeedai/contracts';

export type LoginMode = 'chooser' | 'magic-link' | 'password';

export type InvitationNotice = {
  message: string;
  type: AlertCategory;
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

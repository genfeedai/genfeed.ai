import type { AlertCategory } from '@genfeedai/contracts';

export type LoginMode = 'chooser' | 'magic-link' | 'password';

export type InvitationNotice = {
  message: string;
  type: AlertCategory;
};

export interface LoginBetterAuthProps {
  isDesktopShell?: boolean;
  mode?: LoginMode;
}

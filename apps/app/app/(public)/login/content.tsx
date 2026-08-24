'use client';

import LoginBetterAuth, {
  type LoginBetterAuthProps,
} from './login-better-auth';

export default function LoginPage({
  isDesktopShell = false,
}: Pick<LoginBetterAuthProps, 'isDesktopShell'>) {
  return <LoginBetterAuth isDesktopShell={isDesktopShell} mode="chooser" />;
}

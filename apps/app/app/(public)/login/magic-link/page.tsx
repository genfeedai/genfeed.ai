import type { Metadata } from 'next';
import LoginBetterAuth from '../login-better-auth';

export const metadata: Metadata = {
  title: 'Magic Link Sign In | Genfeed',
};

export default function MagicLinkLoginPage() {
  return <LoginBetterAuth mode="magic-link" />;
}

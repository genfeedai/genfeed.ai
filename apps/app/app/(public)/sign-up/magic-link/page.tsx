import type { Metadata } from 'next';
import SignUpBetterAuth from '../sign-up-better-auth';

export const metadata: Metadata = {
  title: 'Magic Link Sign Up | Genfeed',
};

export default function SignUpMagicLinkPage() {
  return <SignUpBetterAuth mode="magic-link" />;
}

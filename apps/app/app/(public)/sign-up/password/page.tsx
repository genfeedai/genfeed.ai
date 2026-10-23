import type { Metadata } from 'next';
import SignUpBetterAuth from '../sign-up-better-auth';

export const metadata: Metadata = {
  alternates: { canonical: 'https://app.genfeed.ai/sign-up/password' },
  description:
    'Create your Genfeed workspace with an email and password and start generating, reviewing, scheduling, and publishing on-brand content.',
  title: 'Create a Genfeed Account with Email',
  twitter: { card: 'summary' },
};

export default function SignUpPasswordPage() {
  return <SignUpBetterAuth mode="password" />;
}

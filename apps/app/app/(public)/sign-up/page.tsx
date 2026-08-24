import type { Metadata } from 'next';
import SignUpForm from './sign-up-form';

/** Indexable for the same reason as `/login` — see that file for the rationale. */
export const metadata: Metadata = {
  alternates: { canonical: 'https://app.genfeed.ai/sign-up' },
  description:
    'Create your Genfeed workspace to generate on-brand content, review team output, schedule campaigns, and publish across every channel.',
  robots: { follow: true, index: true },
  title: 'Create Your Genfeed Workspace Today',
  twitter: { card: 'summary' },
};

export default function AppSignUpPage() {
  return <SignUpForm />;
}

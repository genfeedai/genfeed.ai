import type { Metadata } from 'next';
import SignUpForm from './sign-up-form';

/** Indexable for the same reason as `/login` — see that file for the rationale. */
export const metadata: Metadata = {
  alternates: { canonical: 'https://app.genfeed.ai/sign-up' },
  description: 'Create your Genfeed workspace and start generating content.',
  robots: { follow: true, index: true },
  title: 'Sign Up | Genfeed AI',
};

export default function AppSignUpPage() {
  return <SignUpForm />;
}

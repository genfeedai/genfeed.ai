import { isDesktopServerRequest } from '@app-server/desktop-request.server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginPage from './content';

/**
 * The only indexable pair on this origin, alongside `/sign-up`.
 *
 * The root layout marks app.genfeed.ai `noindex, nofollow` because the studio
 * is an authenticated product surface with nothing to rank. Sign-in and sign-up
 * are the exception every SaaS makes: they are the destinations people search
 * for by name ("genfeed login"), and blocking them sends that query to
 * third-party directories instead of to us. Self-referencing canonicals keep
 * them from competing with the marketing site for anything else.
 *
 * Everything else under `(public)` — password reset, magic-link, OAuth consent
 * — stays blocked, as does the whole `(protected)` tree.
 */
export const metadata: Metadata = {
  alternates: { canonical: 'https://app.genfeed.ai/login' },
  description: 'Sign in to your Genfeed workspace.',
  robots: { follow: true, index: true },
  title: 'Sign In | Genfeed',
};

export default function AppLoginPage() {
  return (
    <Suspense fallback={null}>
      <DesktopAwareLoginPage />
    </Suspense>
  );
}

async function DesktopAwareLoginPage() {
  return <LoginPage isDesktopShell={await isDesktopServerRequest()} />;
}

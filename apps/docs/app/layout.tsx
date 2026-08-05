import type { Metadata } from 'next';
import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import 'nextra-theme-docs/style.css';
import {
  docsContentMetaRegistry,
  docsMdxComponentRegistry,
} from '../content/meta-registry';
import { DOCS_ORIGIN, FALLBACK_DESCRIPTION } from '../lib/page-metadata';
import '../styles/globals.css';

/**
 * Site-wide defaults only. Per-page description, canonical, and og:url are set
 * in app/[[...mdxPath]]/page.tsx — a description defined here would be inherited
 * verbatim by all 51 routes, which is exactly the duplicate the 5 Aug audit
 * flagged. The title template is safe to share: it appends the brand to each
 * page's own heading, which is what lifts one-word docs titles out of the
 * too-short bucket.
 */
export const metadata: Metadata = {
  description: FALLBACK_DESCRIPTION,
  icons: { icon: '/favicon.ico' },
  metadataBase: new URL(DOCS_ORIGIN),
  openGraph: {
    images: ['https://cdn.genfeed.ai/assets/cards/default.jpg'],
    siteName: 'Genfeed.ai Documentation',
    type: 'website',
  },
  title: {
    default: 'Genfeed.ai Documentation',
    template: '%s | Genfeed.ai Docs',
  },
  twitter: {
    card: 'summary_large_image',
    images: ['https://cdn.genfeed.ai/assets/cards/default.jpg'],
  },
};

const navbar = (
  <Navbar
    logo={
      <span style={{ alignItems: 'center', display: 'flex' }}>
        <span
          aria-hidden="true"
          className="dark:invert"
          style={{
            backgroundImage:
              'url(https://cdn.genfeed.ai/assets/branding/logo.svg)',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'contain',
            display: 'inline-block',
            height: 24,
            width: 24,
          }}
        />
        <span style={{ fontWeight: 600, marginLeft: '.5em' }}>Genfeed.ai</span>
      </span>
    }
    projectLink="https://github.com/genfeedai"
    chatLink="https://discord.gg/TmfHg42xVb"
  >
    <a
      href="https://genfeed.ai"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontSize: '0.875rem',
        fontWeight: 500,
        padding: '0.5rem 1rem',
      }}
    >
      Back to Genfeed.ai
    </a>
  </Navbar>
);

const footer = (
  <Footer>
    © 2026{' '}
    <a href="https://genfeed.ai" target="_blank" rel="noopener noreferrer">
      Genfeed
    </a>
    . All rights reserved.
  </Footer>
);

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void docsContentMetaRegistry;
  void docsMdxComponentRegistry;

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/genfeedai/genfeed.ai/tree/master/apps/docs"
          sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
          toc={{ backToTop: true }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}

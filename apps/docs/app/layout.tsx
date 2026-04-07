import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import 'nextra-theme-docs/style.css';
import '../styles/globals.css';

export const metadata = {
  description: 'Generate AI-powered content for your business',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    description: 'Generate AI-powered content for your business',
    images: ['https://cdn.genfeed.ai/assets/cards/default.jpg'],
    title: 'Genfeed.ai Documentation',
  },
  title: 'Genfeed.ai Documentation',
};

const navbar = (
  <Navbar
    logo={
      <span style={{ alignItems: 'center', display: 'flex' }}>
        <img
          src="https://cdn.genfeed.ai/assets/branding/logo.svg"
          alt="Genfeed.ai"
          height={24}
          className="dark:invert"
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
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/genfeedai/docs/tree/main"
          sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
          toc={{ backToTop: true }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}

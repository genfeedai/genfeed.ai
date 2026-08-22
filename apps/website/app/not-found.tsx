import { metadata as metadataHelper } from '@helpers/media/metadata/metadata.helper';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';

const { name, description, url, cards } = metadataHelper;

export const metadata = {
  description,
  metadataBase: new URL('https://cdn.genfeed.ai'),
  openGraph: {
    description,
    images: {
      alt: 'Genfeed.ai',
      height: 836,
      type: 'image/jpeg',
      url: cards.default,
      width: 1600,
    },
    siteName: name,
    title: `Page Not Found - ${name}`,
    type: 'website',
    url,
  },
  title: `Page Not Found - ${name}`,
};

const RECOVERY_LINKS = [
  {
    description:
      'Browse every public product, use case, integration, and article.',
    href: '/sitemap.xml',
    label: 'Sitemap',
  },
  {
    description: 'Read the compact machine-oriented index and discovery links.',
    href: '/llms.txt',
    label: 'LLM index',
  },
  {
    description: 'Open product, API, authentication, and MCP documentation.',
    href: 'https://docs.genfeed.ai',
    label: 'Documentation',
  },
] as const;

export default function NotFound() {
  return (
    <PageLayout
      compact
      title="Page not found"
      description="The requested Genfeed route does not exist. Use one of these canonical discovery paths to recover."
    >
      <section className="mx-auto grid w-full max-w-4xl gap-4 px-6 pb-10 md:grid-cols-3">
        {RECOVERY_LINKS.map((link) => (
          <Link
            className="gen-card-spotlight p-6 transition-colors hover:border-primary"
            href={link.href}
            key={link.href}
          >
            <h2 className="text-lg font-semibold">{link.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {link.description}
            </p>
          </Link>
        ))}
      </section>
      <section className="mx-auto w-full max-w-4xl px-6 pb-20">
        <h2 className="text-xl font-semibold">Agent recovery</h2>
        <pre className="mt-4 overflow-x-auto border gen-border bg-muted/40 p-5 text-sm text-muted-foreground">
          {`# 404: Genfeed route not found\n\nRecover with /llms.txt, /sitemap.xml, /openapi.json, or https://docs.genfeed.ai.`}
        </pre>
      </section>
    </PageLayout>
  );
}

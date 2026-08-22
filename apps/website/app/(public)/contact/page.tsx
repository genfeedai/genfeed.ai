import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';

export const generateMetadata = createPageMetadataWithCanonical(
  'Contact Genfeed: Support, Security, and Sales',
  'Contact Genfeed for product support, security reports, privacy questions, partnerships, and managed content operations.',
  '/contact',
);

const CONTACT_PATHS = [
  {
    description:
      'For account access, billing, integrations, API credentials, and product behavior, include the affected workspace and a concise reproduction. Never email API keys, passwords, claim tokens, or other credentials.',
    email: 'support@genfeed.ai',
    title: 'Product support',
  },
  {
    description:
      'For responsible disclosure of a suspected vulnerability, describe the affected surface and impact without including personal data. We will coordinate validation and remediation through a private channel.',
    email: 'support@genfeed.ai',
    title: 'Security',
  },
  {
    description:
      'For data-protection requests, privacy questions, or information about how Genfeed processes account and content data, identify the relevant account email and request type.',
    email: 'privacy@genfeed.ai',
    title: 'Privacy',
  },
] as const;

export default function ContactPage() {
  return (
    <PageLayout
      compact
      title="Contact Genfeed"
      description="Reach the right team for product support, security, privacy, partnerships, or managed content operations."
    >
      <WebSection maxWidth="lg" py="md">
        <div className="mx-auto mb-10 max-w-3xl space-y-4 text-base leading-7 text-muted-foreground">
          <p>
            Genfeed is the open-source AI content operating system for creation,
            automation, publishing, and analytics. The public documentation and
            GitHub repository are the fastest routes for implementation
            questions; direct email is available when a request involves an
            account, a private security detail, personal data, or a commercial
            engagement.
          </p>
          <p>
            Messages should include the product surface, expected behavior,
            actual behavior, and relevant non-secret identifiers. Agents may use
            these addresses to prepare a support request, but a human should
            review any message before it is sent.
          </p>
        </div>
        <NeuralGrid columns={3}>
          {CONTACT_PATHS.map((path) => (
            <NeuralGridItem
              description={path.description}
              key={path.title}
              padding="lg"
              title={path.title}
            >
              <Link
                className="mt-5 inline-flex font-medium text-primary underline-offset-4 hover:underline"
                href={`mailto:${path.email}`}
              >
                {path.email}
              </Link>
            </NeuralGridItem>
          ))}
        </NeuralGrid>
      </WebSection>
      <WebSection bg="bordered" maxWidth="lg" py="md">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <h2 className="text-3xl font-semibold">Sales and partnerships</h2>
          <p className="text-muted-foreground">
            For managed content operations, agency programs, enterprise hosting,
            or partnerships, email hello@genfeed.ai or book a product demo.
            Include your publishing channels, approximate output needs, and
            whether you prefer managed cloud or self-hosting.
          </p>
          <div className="flex flex-wrap justify-center gap-5">
            <Link
              className="font-medium text-primary hover:underline"
              href="mailto:hello@genfeed.ai"
            >
              hello@genfeed.ai
            </Link>
            <Link
              className="font-medium text-primary hover:underline"
              href="/demo"
            >
              Book a demo
            </Link>
          </div>
        </div>
      </WebSection>
    </PageLayout>
  );
}

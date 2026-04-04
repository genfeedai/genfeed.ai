import { FAQ_CATEGORIES } from '@data/faq.data';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import FAQContent from '@public/faq/faq-content';
import type { Metadata, ResolvingMetadata } from 'next';

const faqDescription =
  'Find answers about Genfeed pricing, features, AI content generation, platform access, and technical specifications. Everything you need to know.';

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_CATEGORIES.flatMap((category) =>
    category.questions.map((item) => ({
      '@type': 'Question',
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
      name: item.question,
    })),
  ),
};

export async function generateMetadata(
  _params: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = (await parent).openGraph?.images || [];

  return {
    alternates: {
      canonical: `${metadata.url}/faq`,
    },
    description: faqDescription,
    openGraph: {
      description: faqDescription,
      images: [...previousImages],
      title: `FAQ | ${metadata.name}`,
      url: `${metadata.url}/faq`,
    },
    title: `FAQ | ${metadata.name}`,
    twitter: {
      description: faqDescription,
      images: [...previousImages],
    },
  };
}

export default function FAQPage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      <FAQContent />
    </>
  );
}

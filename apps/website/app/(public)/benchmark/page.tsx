import { metadata as siteMetadata } from '@helpers/media/metadata/metadata.helper';
import BenchmarkContent from '@public/benchmark/benchmark-content';
import { getBenchmarkData } from '@public/benchmark/benchmark-loader';
import { EnvironmentService } from '@services/core/environment.service';
import type { Metadata } from 'next';

const TITLE = 'Benchmark';
const DESCRIPTION =
  'An independent benchmark for image and video generation models. Public tasks, blind pairwise judging, Elo, and a match journal anyone can re-run.';

/**
 * The card is composed per season rather than falling back to the shared site
 * image: this page's whole reason to exist is a number that changes, and a
 * social card that never changes is a card nobody clicks twice.
 */
export async function generateMetadata(): Promise<Metadata> {
  const url = `${EnvironmentService.apps.website}/benchmark`;
  const image = `${EnvironmentService.apps.website}/benchmark/og`;

  return {
    alternates: { canonical: url },
    description: DESCRIPTION,
    openGraph: {
      description: DESCRIPTION,
      images: {
        alt: 'Genfeed Benchmark — independent image and video model bench',
        height: 630,
        type: 'image/png',
        url: image,
        width: 1200,
      },
      siteName: siteMetadata.name,
      title: TITLE,
      type: 'website',
      url,
    },
    title: `${TITLE} | ${siteMetadata.name}`,
    twitter: {
      card: 'summary_large_image',
      creator: '@genfeedai',
      description: DESCRIPTION,
      images: [image],
      title: TITLE,
    },
  };
}

export default async function BenchmarkPage() {
  const data = await getBenchmarkData();

  return <BenchmarkContent data={data} />;
}

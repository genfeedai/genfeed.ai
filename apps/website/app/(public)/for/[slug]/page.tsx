import { getAllUseCaseSlugs } from '@data/use-cases.data';
import { permanentRedirect } from 'next/navigation';

export function generateStaticParams() {
  return getAllUseCaseSlugs().map((slug) => ({ slug }));
}

export default async function ForPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/use-cases/${slug}`);
}

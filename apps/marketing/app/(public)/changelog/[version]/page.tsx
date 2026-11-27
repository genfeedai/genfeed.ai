import { getPublishedReleases } from '@data/releases.data';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import {
  formatReleaseDate,
  releaseNotes,
  releasePath,
  releaseSummary,
} from '../release-notes';
import ReleaseContent from './release-content';

export const revalidate = 300;

interface ReleasePageProps {
  params: Promise<{ version: string }>;
}

async function findRelease(version: string) {
  const releases = await getPublishedReleases().catch(() => []);
  return releases.find(
    (release) => release.tag === decodeURIComponent(version),
  );
}

export async function generateMetadata(
  { params }: ReleasePageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { version } = await params;
  const release = await findRelease(version);
  if (!release) {
    return { robots: { follow: false, index: false } };
  }

  const summary = releaseSummary(releaseNotes(release.body, release.tag));
  const date = formatReleaseDate(release.publishedAt);
  const description = summary
    ? `What shipped in Genfeed ${release.tag} on ${date}: ${summary}.`
    : `What shipped in Genfeed ${release.tag} on ${date}.`;

  return createPageMetadataWithCanonical(
    `${release.tag} release notes`,
    description,
    releasePath(release.tag),
  )({}, parent);
}

export default async function ReleasePage({ params }: ReleasePageProps) {
  const { version } = await params;
  const release = await findRelease(version);
  if (!release) {
    notFound();
  }

  return <ReleaseContent release={release} />;
}

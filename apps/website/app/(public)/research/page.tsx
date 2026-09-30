import ResearchContent from '@public/research/research-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Content Research: Trends and Hooks',
  'Discover trending content and hooks, track competitor social accounts, and study winning ad creative. Turn any trend into a ready brief in one click.',
  '/research',
);

export default function Research() {
  return <ResearchContent />;
}

import TurboContent from '@public/turbo/turbo-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

const createMetadata = createPageMetadataWithCanonical(
  'Turbo — On-brand content, drafted for you',
  'Sign up, tell Genfeed about your business, and Turbo drafts on-brand posts you approve before anything goes live.',
  '/turbo',
);

export async function generateMetadata(
  ...args: Parameters<typeof createMetadata>
) {
  return {
    ...(await createMetadata(...args)),
    robots: { index: false, follow: false },
  };
}

export default function Turbo() {
  return <TurboContent />;
}

import type { Metadata } from 'next';
import OfflineContent from './content';

export const metadata: Metadata = {
  robots: {
    index: false,
  },
};

export default function Page() {
  return <OfflineContent />;
}

import type { Metadata } from 'next';
import LocalDesktopContent from './content';

export const metadata: Metadata = {
  robots: { index: false },
  title: 'Local workspace',
};

export default function LocalDesktopPage() {
  return <LocalDesktopContent />;
}

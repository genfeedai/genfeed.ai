import type { Metadata } from 'next';
import ManagedCreditsSuccessContent from './success-content';

export const metadata: Metadata = {
  title: 'Credits Added | Genfeed',
};

export default function ManagedCreditsSuccessPage() {
  return <ManagedCreditsSuccessContent />;
}

import type { Metadata } from 'next';
import { OnboardingContent } from '@/components/onboarding/OnboardingContent';

export const metadata: Metadata = {
  description: 'Configure your Genfeed instance',
  title: 'Setup — Genfeed',
};

export default function OnboardingPage() {
  return <OnboardingContent />;
}

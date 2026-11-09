'use client';

import { EmptyState } from '@ui/primitives/empty-state';
import { useTranslations } from 'next-intl';
import type { NewsletterBrandGateProps } from '@/features/newsletter/props/newsletter.props';

/** Newsletter pages belong to one brand; the all-brands view asks for one. */
export default function NewsletterBrandGate({
  title,
}: NewsletterBrandGateProps) {
  const translate = useTranslations('pages.publishing.newsletter');
  return <EmptyState title={title} description={translate('pickBrand')} />;
}

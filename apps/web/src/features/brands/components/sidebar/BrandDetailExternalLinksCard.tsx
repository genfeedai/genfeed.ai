'use client';
import { ButtonSize, ButtonVariant, LinkCategory } from '@genfeedai/contracts';
import type { BrandDetailExternalLinksCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { LinkIcon, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

function isManualLinkCategory(category: string | undefined): boolean {
  return (
    !category ||
    category === LinkCategory.WEBSITE ||
    category === LinkCategory.OTHER
  );
}

function formatLinkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Manual website / other URLs for a brand. The title and Add link sit above
 * the card; connected accounts are their own section and are never listed
 * here.
 */
export default function BrandDetailExternalLinksCard({
  links,
  onOpenLinkModal,
}: BrandDetailExternalLinksCardProps) {
  const t = useTranslations('pages.brandLinks');
  const manualLinks = useMemo(
    () => links.filter((link) => isManualLinkCategory(link.category)),
    [links],
  );

  return (
    <CollectionSection
      actions={
        <Button
          icon={<Plus className="size-3" />}
          label={t('addLink')}
          onClick={() => onOpenLinkModal()}
          size={ButtonSize.XS}
          variant={ButtonVariant.SECONDARY}
        />
      }
      title={t('websiteLinksTitle')}
    >
      {manualLinks.length === 0 ? (
        <EmptyState title={t('noWebsiteLinks')} />
      ) : (
        <Card>
          <ul className="flex flex-col divide-y divide-border">
            {manualLinks.map((link) => (
              <li
                className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                key={link.id}
              >
                <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <Link
                  className="min-w-0 flex-1 hover:underline"
                  href={link.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="block truncate text-sm">{link.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatLinkHost(link.url)}
                  </span>
                </Link>
                <Button
                  ariaLabel={t('editLink', { label: link.label })}
                  icon={<Pencil className="size-3.5" />}
                  onClick={() => onOpenLinkModal(link)}
                  size={ButtonSize.ICON}
                  variant={ButtonVariant.GHOST}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </CollectionSection>
  );
}

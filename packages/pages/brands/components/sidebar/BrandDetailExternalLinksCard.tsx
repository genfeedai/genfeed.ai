'use client';

import { ButtonSize, ButtonVariant, LinkCategory } from '@genfeedai/contracts';
import type { BrandDetailExternalLinksCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { LinkIcon, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

const EMPTY_STATE_CLASSNAME =
  'rounded-md bg-background-secondary/50 px-3 py-3 text-xs text-muted-foreground';

const SECTION_LABEL_CLASSNAME =
  'text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground';

function isManualLinkCategory(category: string | undefined): boolean {
  return (
    !category ||
    category === LinkCategory.WEBSITE ||
    category === LinkCategory.OTHER
  );
}

function formatConnected(socialCount: number, adCount: number): string {
  const connected = `${socialCount} connected`;
  if (adCount === 0) {
    return connected;
  }
  return `${connected} · ${adCount} ad ${adCount === 1 ? 'account' : 'accounts'}`;
}

/**
 * One card for everything a brand links out to: the connected-accounts summary
 * (count + Manage — the accounts themselves live on /settings/connected-accounts)
 * and manual website / other URLs. Without `social`, the full connect card owns
 * socials and this renders as plain website links.
 */
export default function BrandDetailExternalLinksCard({
  links,
  onOpenLinkModal,
  social,
}: BrandDetailExternalLinksCardProps) {
  const manualLinks = useMemo(
    () => links.filter((link) => isManualLinkCategory(link.category)),
    [links],
  );
  const hasManualLinks = manualLinks.length > 0;

  return (
    <Card
      label={social ? 'Social & links' : 'Website links'}
      description={
        social
          ? 'Connected accounts for publishing and ads, plus your websites.'
          : 'Websites and other URLs.'
      }
      headerAction={
        social ? (
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            className="h-8 shrink-0 px-2.5 text-xs"
          >
            <Link href={social.manageHref}>Manage</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {social ? (
          <div className="rounded-md bg-background-secondary/50 px-3 py-2.5">
            <p className={SECTION_LABEL_CLASSNAME}>Accounts</p>
            <p className="mt-1 text-sm text-foreground/90">
              {formatConnected(
                social.connectedSocialCount,
                social.connectedAdAccountCount,
              )}
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className={SECTION_LABEL_CLASSNAME}>Websites & other</p>
          {hasManualLinks ? (
            manualLinks.map((link) => (
              <div key={link.id} className="flex gap-1.5">
                <Button
                  asChild
                  variant={ButtonVariant.SECONDARY}
                  className="flex-1 gap-1.5 text-xs [&_svg]:size-3.5"
                  size={ButtonSize.SM}
                  wrapperClassName="flex-1"
                >
                  <Link href={link.url} target="_blank">
                    <LinkIcon className="size-3.5" />
                    {link.label}
                  </Link>
                </Button>

                <Button
                  icon={<Pencil className="size-3.5" />}
                  ariaLabel={`Edit ${link.label}`}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.ICON}
                  className="size-8 shrink-0 p-0 [&_svg]:size-3.5"
                  onClick={() => onOpenLinkModal(link)}
                />
              </div>
            ))
          ) : (
            <div className={EMPTY_STATE_CLASSNAME}>No website links yet.</div>
          )}

          <Button
            variant={ButtonVariant.SECONDARY}
            className="w-full gap-1.5 text-xs [&_svg]:size-3.5"
            size={ButtonSize.SM}
            wrapperClassName="w-full"
            onClick={() => onOpenLinkModal()}
            icon={<Plus className="size-3.5" />}
            label="Add website link"
          />
        </div>
      </div>
    </Card>
  );
}

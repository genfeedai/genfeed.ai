'use client';

import { ButtonSize, ButtonVariant, LinkCategory } from '@genfeedai/contracts';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { BrandDetailExternalLinksCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { LinkIcon, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

const EMPTY_STATE_CLASSNAME =
  'rounded-md bg-background-secondary/50 px-3 py-3 text-xs text-muted-foreground';

function isManualLinkCategory(category: string | undefined): boolean {
  return (
    !category ||
    category === LinkCategory.WEBSITE ||
    category === LinkCategory.OTHER
  );
}

function connectionLabel(connection: {
  handle?: string | null;
  label?: string | null;
  name?: string | null;
  platform: string;
}): string {
  return (
    connection.name ||
    connection.label ||
    (connection.handle ? `@${connection.handle.replace(/^@/, '')}` : null) ||
    connection.platform
  );
}

/**
 * Manual external URLs (website / other) + read-only connected socials.
 * Social OAuth is managed on /settings/social — not typed as freeform links.
 */
export default function BrandDetailExternalLinksCard({
  links,
  onOpenLinkModal,
  socialConnections = [],
  manageSocialHref,
}: BrandDetailExternalLinksCardProps) {
  const manualLinks = useMemo(
    () => links.filter((link) => isManualLinkCategory(link.category)),
    [links],
  );
  const hasManualLinks = manualLinks.length > 0;
  const hasSocialConnections = socialConnections.length > 0;

  return (
    <Card
      label="External Links"
      description="Websites and other URLs. Social profiles come from connected accounts."
    >
      <div className="flex flex-col gap-3">
        {hasSocialConnections ? (
          <div className="space-y-2">
            <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Connected social
            </p>
            <div className="flex flex-col gap-1.5">
              {socialConnections.map((connection) => {
                const label = connectionLabel(connection);
                const icon = getPlatformIcon(connection.platform, 'size-3.5');
                const rowClassName =
                  'flex min-w-0 items-center gap-2 rounded-md bg-background-secondary px-3 py-2 text-xs shadow-border';

                if (connection.url) {
                  return (
                    <Link
                      key={connection.credentialId}
                      href={connection.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${rowClassName} transition-colors hover:bg-background`}
                    >
                      {icon}
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {label}
                      </span>
                      <span className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
                        {connection.platform}
                      </span>
                    </Link>
                  );
                }

                return (
                  <div key={connection.credentialId} className={rowClassName}>
                    {icon}
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {label}
                    </span>
                    <span className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
                      {connection.platform}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : manageSocialHref ? (
          <div className={EMPTY_STATE_CLASSNAME}>
            No social accounts connected.{' '}
            <Link
              href={manageSocialHref}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Connect under Social
            </Link>
            .
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Websites & other
          </p>
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

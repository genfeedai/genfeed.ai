'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailExternalLinksCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { LinkIcon, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';

const EMPTY_STATE_CLASSNAME =
  'rounded-md bg-background-secondary/50 px-3 py-3 text-xs text-muted-foreground';

export default function BrandDetailExternalLinksCard({
  links,
  onOpenLinkModal,
}: BrandDetailExternalLinksCardProps) {
  const hasLinks = Boolean(links && links.length > 0);

  return (
    <Card
      label="External Links"
      description="Websites and profiles linked to this brand."
    >
      <div className="flex flex-col gap-2">
        {hasLinks ? (
          links?.map((link) => (
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
          <div className={EMPTY_STATE_CLASSNAME}>No external links yet.</div>
        )}

        <Button
          variant={ButtonVariant.SECONDARY}
          className="w-full gap-1.5 text-xs [&_svg]:size-3.5"
          size={ButtonSize.SM}
          wrapperClassName="w-full"
          onClick={() => onOpenLinkModal()}
          icon={<Plus className="size-3.5" />}
          label="Add link"
        />
      </div>
    </Card>
  );
}

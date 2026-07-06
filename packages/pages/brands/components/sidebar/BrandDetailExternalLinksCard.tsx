'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailExternalLinksCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiLink, HiPencil, HiPlus } from 'react-icons/hi2';

export default function BrandDetailExternalLinksCard({
  links,
  onOpenLinkModal,
}: BrandDetailExternalLinksCardProps) {
  return (
    <Card>
      <h2 className="text-lg font-semibold">External Links</h2>
      <div className="flex flex-col gap-2">
        {links &&
          links.length > 0 &&
          links.map((link) => (
            <div key={link.id} className="flex gap-2">
              <Button
                asChild
                variant={ButtonVariant.OUTLINE}
                className="flex-1 gap-2"
                wrapperClassName="flex-1"
              >
                <Link href={link.url} target="_blank">
                  <HiLink />
                  {link.label}
                </Link>
              </Button>

              <Button
                label={<HiPencil />}
                variant={ButtonVariant.SECONDARY}
                onClick={() => onOpenLinkModal(link)}
              />
            </div>
          ))}

        <Button
          variant={ButtonVariant.SECONDARY}
          className="w-full gap-2 mt-4"
          wrapperClassName="w-full"
          onClick={() => onOpenLinkModal()}
          label={
            <>
              <HiPlus />
              Add Link
            </>
          }
        />
      </div>
    </Card>
  );
}

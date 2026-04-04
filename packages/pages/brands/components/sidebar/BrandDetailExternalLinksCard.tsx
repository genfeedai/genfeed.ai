'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailExternalLinksCardProps } from '@props/pages/brand-detail.props';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
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
              <Link
                href={link.url}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-300 border border-dashed border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 flex-1"
                target="_blank"
              >
                <HiLink />
                {link.label}
              </Link>

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

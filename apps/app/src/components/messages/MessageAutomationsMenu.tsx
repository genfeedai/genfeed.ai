'use client';

import { getMessagesMenuItemsForScope } from '@app-config/messages-menu-items.config';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Zap } from 'lucide-react';
import Link from 'next/link';

export default function MessageAutomationsMenu() {
  const { brandSlug, href } = useOrgUrl();
  const items = getMessagesMenuItemsForScope(brandSlug).filter(
    (item) => item.hrefScope === 'brand',
  );
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Message automations"
          title="Message automations"
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          className="size-7"
        >
          <Zap className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Message automations</DropdownMenuLabel>
        {items.map((item) =>
          item.href ? (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={href(item.href)}>{item.label}</Link>
            </DropdownMenuItem>
          ) : null,
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

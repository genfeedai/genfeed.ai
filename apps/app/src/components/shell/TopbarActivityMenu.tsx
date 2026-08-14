'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Clock } from 'lucide-react';
import Link from 'next/link';

export default function TopbarActivityMenu() {
  const { href } = useOrgUrl();
  const activityHref = href(APP_ROUTES.WORKSPACE.ACTIVITY);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          className="size-8"
          ariaLabel="Open activity"
          data-testid="topbar-activity-menu"
        >
          <Clock className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem asChild>
          <Link href={activityHref}>Activity</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

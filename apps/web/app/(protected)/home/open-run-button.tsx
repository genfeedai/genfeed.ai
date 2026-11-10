'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useIsAppAvailable } from '@/components/shell/use-available-rail-apps';

/** Opens a workflow run; absent while the organization has no Automation. */
export default function OpenRunButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const isAutomationAvailable = useIsAppAvailable('automation');

  if (!isAutomationAvailable) {
    return null;
  }

  return (
    <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
      <Link href={href}>{label}</Link>
    </Button>
  );
}

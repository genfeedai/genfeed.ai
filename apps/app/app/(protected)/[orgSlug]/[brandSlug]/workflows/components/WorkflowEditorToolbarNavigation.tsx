'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiArrowLeft } from 'react-icons/hi2';

export default function WorkflowEditorToolbarNavigation() {
  const { href } = useOrgUrl();

  return (
    <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
      <Link href={href('/workflows')}>
        <HiArrowLeft className="h-4 w-4" />
        Workflows
      </Link>
    </Button>
  );
}

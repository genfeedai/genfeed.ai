'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function WorkflowEditorToolbarNavigation() {
  const { href } = useOrgUrl();

  return (
    <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
      <Link href={href(APP_ROUTES.AUTOMATION.WORKFLOWS)}>
        <ArrowLeft className="size-4" />
        Workflows
      </Link>
    </Button>
  );
}

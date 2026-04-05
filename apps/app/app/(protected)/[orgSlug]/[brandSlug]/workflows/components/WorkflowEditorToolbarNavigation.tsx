'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiArrowLeft } from 'react-icons/hi2';

const WORKFLOW_INDEX_HREF = '/workflows';

export default function WorkflowEditorToolbarNavigation() {
  return (
    <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.SM}>
      <Link href={WORKFLOW_INDEX_HREF}>
        <HiArrowLeft className="h-4 w-4" />
        Workflows
      </Link>
    </Button>
  );
}

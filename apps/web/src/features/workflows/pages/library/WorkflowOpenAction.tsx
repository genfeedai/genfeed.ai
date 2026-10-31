'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { WorkflowOpenActionProps } from './workflow-library.types';

/** The one visible primary action on a workflow row or card. */
export default function WorkflowOpenAction({
  name,
  href,
}: WorkflowOpenActionProps) {
  const translate = useTranslations('common.automation.workflows');

  return (
    <Button
      asChild
      size={ButtonSize.SM}
      variant={ButtonVariant.SECONDARY}
      withWrapper={false}
    >
      <Link
        aria-label={translate('library.openWorkflow', { name })}
        href={href}
      >
        {translate('actions.open')}
      </Link>
    </Button>
  );
}

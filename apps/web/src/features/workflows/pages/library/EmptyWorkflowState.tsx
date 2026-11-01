'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { EmptyStateCard } from '@ui/primitives/empty-state';
import { Copy, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { workflowTemplatesTabPath } from '../workflow-library-tabs';

export default function EmptyWorkflowState() {
  const { href } = useOrgUrl();
  const translate = useTranslations('common.automation.workflows.library');

  return (
    <EmptyStateCard
      icon={Sparkles}
      title={translate('emptyTitle')}
      actions={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href={href(workflowTemplatesTabPath())}>
            <Button
              label={translate('emptyActionTemplates')}
              variant={ButtonVariant.SECONDARY}
              icon={<Copy className="size-4" />}
            />
          </Link>
          <Link href={href(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW)}>
            <Button
              label={translate('emptyActionCreate')}
              variant={ButtonVariant.DEFAULT}
              icon={<Plus className="size-4" />}
            />
          </Link>
        </div>
      }
    />
  );
}

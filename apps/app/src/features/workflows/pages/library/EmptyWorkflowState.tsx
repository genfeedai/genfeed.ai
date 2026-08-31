'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { Button } from '@ui/primitives/button';
import { Copy, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function EmptyWorkflowState() {
  const { href } = useOrgUrl();
  const translate = useTranslations('common.automation.workflows.library');

  return (
    <CardEmpty
      icon={Sparkles}
      label={translate('emptyTitle')}
      description={translate('emptyDescription')}
      actions={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href={href(APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES)}>
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

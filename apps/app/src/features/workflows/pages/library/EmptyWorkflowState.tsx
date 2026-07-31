'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { Button } from '@ui/primitives/button';
import { Copy, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function EmptyWorkflowState() {
  const { href } = useOrgUrl();

  return (
    <CardEmpty
      icon={Sparkles}
      label="No workflows yet"
      description="Create your first workflow for a fixed, repeatable automation pipeline."
      actions={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href={href(APP_ROUTES.ORCHESTRATION.WORKFLOWS_TEMPLATES)}>
            <Button
              label="Browse Templates"
              variant={ButtonVariant.SECONDARY}
              icon={<Copy className="size-4" />}
            />
          </Link>
          <Link href={href(APP_ROUTES.ORCHESTRATION.WORKFLOWS_NEW)}>
            <Button
              label="Create Workflow"
              variant={ButtonVariant.DEFAULT}
              icon={<Plus className="size-4" />}
            />
          </Link>
        </div>
      }
    />
  );
}

'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import {
  HiOutlineDocumentDuplicate,
  HiOutlinePlus,
  HiOutlineSparkles,
} from 'react-icons/hi2';

export default function EmptyWorkflowState() {
  const { href } = useOrgUrl();

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-white/10 bg-card/40 px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-foreground/5 text-foreground/30">
        <HiOutlineSparkles className="size-8" />
      </span>
      <div>
        <p className="text-lg font-medium">No workflows yet</p>
        <p className="mt-1 text-sm text-foreground/50">
          Install a routine or start from a template for a fixed, repeatable
          automation pipeline.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href={href('/workflows/templates')}>
          <Button
            label="Install Routine"
            variant={ButtonVariant.DEFAULT}
            icon={<HiOutlineDocumentDuplicate className="size-4" />}
          />
        </Link>
        <Link href={href('/workflows/new')}>
          <Button
            label="Create Workflow"
            variant={ButtonVariant.SECONDARY}
            icon={<HiOutlinePlus className="size-4" />}
          />
        </Link>
      </div>
    </div>
  );
}

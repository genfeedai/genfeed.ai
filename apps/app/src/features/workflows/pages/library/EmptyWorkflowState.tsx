'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CardEmpty from '@ui/card/empty/CardEmpty';
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
    <CardEmpty
      icon={HiOutlineSparkles}
      label="No workflows yet"
      description="Create your first workflow for a fixed, repeatable automation pipeline."
      actions={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href={href('/workflows/templates')}>
            <Button
              label="Browse Templates"
              variant={ButtonVariant.SECONDARY}
              icon={<HiOutlineDocumentDuplicate className="size-4" />}
            />
          </Link>
          <Link href={href('/workflows/new')}>
            <Button
              label="Create Workflow"
              variant={ButtonVariant.DEFAULT}
              icon={<HiOutlinePlus className="size-4" />}
            />
          </Link>
        </div>
      }
    />
  );
}

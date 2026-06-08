'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { HiPlus } from 'react-icons/hi2';

type WorkspaceActionButtonProps = {
  label: string;
  onClick: () => void;
};

export default function WorkspaceActionButton({
  label,
  onClick,
}: WorkspaceActionButtonProps) {
  return (
    <Button
      ariaLabel={label}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      className="gen-shell-control flex w-full items-center gap-2.5 rounded-md p-2.5 text-left text-sm font-medium text-foreground/72"
    >
      <HiPlus className="size-4 flex-shrink-0" />
      <span>{label}</span>
    </Button>
  );
}

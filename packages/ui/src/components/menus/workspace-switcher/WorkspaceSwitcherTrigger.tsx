'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { HiChevronDown } from 'react-icons/hi2';

type WorkspaceSwitcherTriggerProps = {
  triggerLabel: string;
  triggerSubLabel: string | null;
  triggerImage: string | undefined;
  isSwitchingOrganization: boolean;
  isOpen: boolean;
};

export function WorkspaceSwitcherTrigger({
  triggerLabel,
  triggerSubLabel,
  triggerImage,
  isSwitchingOrganization,
  isOpen,
}: WorkspaceSwitcherTriggerProps) {
  return (
    <Button
      type="button"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      data-testid="workspace-switcher-trigger"
      ariaLabel="Switch workspace"
      isDisabled={isSwitchingOrganization}
      className={cn(
        'flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 transition-colors cursor-pointer',
        'hover:bg-white/[0.06]',
        isSwitchingOrganization && 'opacity-50 cursor-not-allowed',
        isOpen && 'bg-white/[0.06]',
      )}
    >
      {triggerImage ? (
        <div className="flex size-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-background">
          <Image
            src={triggerImage}
            alt={triggerLabel}
            width={20}
            height={20}
            className="object-cover object-center"
            sizes="20px"
            style={{ height: 'auto', width: 'auto' }}
          />
        </div>
      ) : (
        <div className="flex size-5 flex-shrink-0 items-center justify-center rounded bg-white/10 text-[10px] font-bold text-white/70">
          {triggerLabel.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col text-left leading-tight">
        <span className="truncate text-[13px] font-medium text-foreground/88">
          {isSwitchingOrganization ? 'Switching…' : triggerLabel}
        </span>
        {triggerSubLabel ? (
          <span className="truncate text-[10px] text-foreground/40">
            {triggerSubLabel}
          </span>
        ) : null}
      </div>
      <HiChevronDown
        className={cn(
          'size-3.5 flex-shrink-0 text-white/40 transition-transform duration-200',
          isOpen && 'rotate-180',
        )}
      />
    </Button>
  );
}

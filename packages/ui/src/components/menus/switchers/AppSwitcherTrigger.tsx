'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import type { RefObject } from 'react';

type AppSwitcherTriggerProps = {
  buttonRef: RefObject<HTMLDivElement>;
  currentApp: string;
  isLoading: boolean;
  isOpen: boolean;
  logoUrl: string | undefined;
  onToggle: (e: React.MouseEvent) => void;
};

export function AppSwitcherTrigger({
  buttonRef,
  currentApp,
  isLoading,
  isOpen,
  logoUrl,
  onToggle,
}: AppSwitcherTriggerProps) {
  return (
    <div className="flex items-center" ref={buttonRef}>
      <Button
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        ariaLabel={currentApp || 'Apps'}
        title={currentApp || 'Apps'}
        isDisabled={isLoading}
        onClick={onToggle}
        className={cn(
          'flex items-center justify-center p-2 transition-all relative',
          !isLoading && 'hover:bg-white/10 cursor-pointer',
          isLoading && 'cursor-wait',
          isOpen && 'bg-white/10',
        )}
      >
        {logoUrl && logoUrl !== '' && (
          <Image
            src={logoUrl}
            alt={EnvironmentService.LOGO_ALT}
            className={cn(
              'size-6 object-contain dark:invert',
              isLoading && 'opacity-50',
            )}
            width={24}
            height={24}
            sizes="24px"
            priority
            style={{ height: 'auto', width: 'auto' }}
          />
        )}

        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="animate-spin size-3 border-2 border-primary border-t-transparent rounded-full opacity-50" />
          </span>
        )}
      </Button>
    </div>
  );
}

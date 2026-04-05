'use client';

import type { ICommandPaletteItemProps } from '@genfeedai/interfaces/ui/command-palette.interface';
import { Kbd } from '@genfeedai/ui';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
import type { ReactNode } from 'react';

export function CommandPaletteItem({
  command,
  isSelected,
  onClick,
}: ICommandPaletteItemProps): ReactNode {
  const IconComponent =
    typeof command.icon === 'function' ? command.icon : null;
  const isStringIcon = typeof command.icon === 'string';

  return (
    <Button
      withWrapper={false}
      variant={ButtonVariant.UNSTYLED}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-200',
        'hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        isSelected && 'bg-background',
      )}
    >
      {command.icon && (
        <span className="flex-shrink-0 opacity-70">
          {IconComponent ? (
            <IconComponent className="h-5 w-5" />
          ) : isStringIcon ? (
            <span className="text-xl">{command.icon as string}</span>
          ) : null}
        </span>
      )}

      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{command.label}</span>
          {command.shortcut && (
            <div className="ml-auto flex gap-2">
              {command.shortcut.map((key) => (
                <Kbd key={key} variant="muted" size="xs" className="opacity-60">
                  {key}
                </Kbd>
              ))}
            </div>
          )}
        </div>
        {command.description && (
          <p className="truncate text-sm opacity-60">{command.description}</p>
        )}
      </div>
    </Button>
  );
}

'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { HiCheck } from 'react-icons/hi2';

type WorkspaceSwitcherSectionItem = {
  icon?: ReactNode;
  id: string;
  imageUrl?: string;
  isActive: boolean;
  label: string;
  meta?: string;
};

type WorkspaceSwitcherSectionProps = {
  emptyMessage: string;
  items: WorkspaceSwitcherSectionItem[];
  title: string;
  onSelect: (id: string) => void;
};

export default function WorkspaceSwitcherSection({
  emptyMessage,
  items,
  title,
  onSelect,
}: WorkspaceSwitcherSectionProps) {
  return (
    <div className="border-b border-white/[0.06] px-1 pb-2 pt-1 last:border-b-0">
      <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/32">
        {title}
      </p>

      {items.length === 0 ? (
        <div className="gen-shell-empty-state rounded-md p-3 text-xs text-foreground/42">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <Button
              key={item.id}
              ariaLabel={`Select ${item.label}`}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => {
                if (!item.isActive) {
                  onSelect(item.id);
                }
              }}
              isDisabled={item.isActive}
              className={cn(
                'flex w-full items-center gap-3 rounded-md p-2.5 text-left transition-all duration-200',
                item.isActive
                  ? 'gen-shell-surface text-foreground shadow-[0_18px_40px_-32px_rgba(0,0,0,0.88)]'
                  : 'text-foreground/68 hover:bg-white/[0.035] hover:text-foreground',
              )}
            >
              {item.imageUrl ? (
                <div className="gen-shell-surface flex size-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
                  <Image
                    src={item.imageUrl}
                    alt={item.label}
                    width={20}
                    height={20}
                    className="object-cover object-center"
                    sizes="20px"
                    style={{ height: 'auto', width: 'auto' }}
                  />
                </div>
              ) : item.icon ? (
                <div className="flex size-5 flex-shrink-0 items-center justify-center text-foreground/42">
                  {item.icon}
                </div>
              ) : (
                <div
                  className={cn(
                    'flex size-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    item.isActive
                      ? 'bg-white text-background'
                      : 'bg-white/[0.08] text-foreground/58',
                  )}
                >
                  {item.label.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium tracking-[-0.01em]">
                  {item.label}
                </p>
                {item.meta ? (
                  <p className="truncate text-xs text-foreground/42">
                    {item.meta}
                  </p>
                ) : null}
              </div>

              {item.isActive ? (
                <HiCheck className="size-4 flex-shrink-0 text-emerald-300" />
              ) : null}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

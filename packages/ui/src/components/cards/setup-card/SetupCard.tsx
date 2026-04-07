'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { useSetupCard } from '@hooks/utils/use-setup-card/use-setup-card';
import Link from 'next/link';
import { HiCheck, HiChevronRight } from 'react-icons/hi2';

export default function SetupCard() {
  const { isVisible, steps, completedCount, totalCount } = useSetupCard();

  if (!isVisible) {
    return null;
  }

  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="mx-3 mb-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-white/60">
          Complete setup
        </span>
        <span className="text-[10px] font-medium text-white/30">
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-white/[0.06] mb-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-0.5">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className={cn(
              'flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[12px] transition-colors duration-150',
              step.isCompleted
                ? 'text-white/30'
                : 'text-white/60 hover:text-white/80 hover:bg-white/[0.04]',
            )}
          >
            {step.isCompleted ? (
              <HiCheck className="w-3.5 h-3.5 text-green-400/60 flex-shrink-0" />
            ) : (
              <HiChevronRight className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
            )}
            <span className={cn(step.isCompleted && 'line-through')}>
              {step.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

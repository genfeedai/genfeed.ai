import { cn } from '@helpers/formatting/cn/cn.util';
import { Check, Minus, Plus, Star } from 'lucide-react';
import { memo } from 'react';
import type { Approach } from '../types';

interface ApproachCardProps {
  approach: Approach;
  isSelected: boolean;
  onSelect: (approachId: string) => void;
  disabled?: boolean;
}

function ApproachCardInner({
  approach,
  isSelected,
  onSelect,
  disabled,
}: ApproachCardProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onSelect(approach.id)}
      disabled={disabled}
      className={cn(
        'w-full text-left rounded-xl border p-4 transition-all',
        isSelected
          ? 'border-blue-500/40 bg-blue-500/10 ring-1 ring-blue-500/20'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-white/90">
          {approach.title}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {approach.recommended && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-400 rounded-full">
              <Star className="size-3 fill-current" />
              Recommended
            </span>
          )}
          {isSelected && (
            <span className="inline-flex items-center justify-center size-5 rounded-full bg-blue-500/20">
              <Check className="size-3 text-blue-400" />
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-white/60 mb-3">{approach.description}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-emerald-400/80 uppercase tracking-wider">
            Pros
          </p>
          {approach.tradeoffs.pros.map((pro) => (
            <div
              key={pro}
              className="flex items-start gap-1.5 text-xs text-white/60"
            >
              <Plus className="size-3 text-emerald-400 shrink-0 mt-0.5" />
              <span>{pro}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-red-400/80 uppercase tracking-wider">
            Cons
          </p>
          {approach.tradeoffs.cons.map((con) => (
            <div
              key={con}
              className="flex items-start gap-1.5 text-xs text-white/60"
            >
              <Minus className="size-3 text-red-400 shrink-0 mt-0.5" />
              <span>{con}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

export const ApproachCard = memo(ApproachCardInner);

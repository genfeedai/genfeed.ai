import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
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
    <Card
      onClick={() => !disabled && onSelect(approach.id)}
      isDisabled={disabled}
      bodyClassName="gap-0 p-4"
      className={cn(
        'w-full',
        isSelected ? 'bg-info/10 shadow-border-strong' : 'hover:bg-hover',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-foreground/90">
          {approach.title}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {approach.recommended && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-warning/10 text-warning rounded-full">
              <Star className="size-3 fill-current" />
              Recommended
            </span>
          )}
          {isSelected && (
            <span className="inline-flex items-center justify-center size-5 rounded-full bg-info/10">
              <Check className="size-3 text-info" />
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-foreground/60 mb-3">{approach.description}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-success/80 uppercase tracking-wider">
            Pros
          </p>
          {approach.tradeoffs.pros.map((pro) => (
            <div
              key={pro}
              className="flex items-start gap-1.5 text-xs text-foreground/60"
            >
              <Plus className="size-3 text-success shrink-0 mt-0.5" />
              <span>{pro}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-destructive/80 uppercase tracking-wider">
            Cons
          </p>
          {approach.tradeoffs.cons.map((con) => (
            <div
              key={con}
              className="flex items-start gap-1.5 text-xs text-foreground/60"
            >
              <Minus className="size-3 text-destructive shrink-0 mt-0.5" />
              <span>{con}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export const ApproachCard = memo(ApproachCardInner);

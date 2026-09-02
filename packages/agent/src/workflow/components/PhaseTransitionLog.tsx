import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Undo2,
  Zap,
} from 'lucide-react';
import { memo, useState } from 'react';
import { useAgentWorkflowStore } from '../store';
import { type GateTrigger, PHASE_LABELS } from '../types';

const TRIGGER_CONFIG: Record<
  GateTrigger,
  { icon: typeof Zap; label: string; color: string }
> = {
  force_advance: {
    color: 'text-warning',
    icon: ArrowRight,
    label: 'Force advance',
  },
  gate_met: {
    color: 'text-success',
    icon: Zap,
    label: 'Gate met',
  },
  rollback: {
    color: 'text-destructive',
    icon: Undo2,
    label: 'Rollback',
  },
};

function PhaseTransitionLogInner() {
  const transitions = useAgentWorkflowStore((s) => s.transitions);
  const [isExpanded, setIsExpanded] = useState(false);

  if (transitions.length === 0) return null;

  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/5 overflow-hidden">
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm text-foreground/60 hover:text-foreground/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="size-4" />
          <span className="font-medium">
            Transition log ({transitions.length})
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
      </Button>

      {isExpanded && (
        <div className="border-t border-foreground/10 divide-y divide-white/5">
          {transitions.map((t) => {
            const config = TRIGGER_CONFIG[t.trigger];
            const TriggerIcon = config.icon;
            const time = new Date(t.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={t.id}
                className="flex items-center gap-3 px-3 py-2 text-xs"
              >
                <span className="text-foreground/30 font-mono w-16 shrink-0">
                  {time}
                </span>
                <TriggerIcon
                  className={cn('size-3.5 shrink-0', config.color)}
                />
                <span className="text-foreground/50">
                  {PHASE_LABELS[t.from]}
                </span>
                <ArrowRight className="size-3 text-foreground/20" />
                <span className="text-foreground/70">{PHASE_LABELS[t.to]}</span>
                <span
                  className={cn(
                    'ml-auto text-2xs font-medium px-1.5 py-0.5 rounded',
                    config.color,
                    'bg-current/10',
                  )}
                  style={{ backgroundColor: 'transparent' }}
                >
                  {config.label} · {t.actor}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const PhaseTransitionLog = memo(PhaseTransitionLogInner);

import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { MergeProgressBarsProps } from '@props/studio/merge.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { HiCheckCircle, HiXCircle } from 'react-icons/hi2';

export default function MergeProgressBars({
  steps,
  overallProgress,
  className = '',
}: MergeProgressBarsProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Overall Progress Bar */}
      {overallProgress !== undefined && (
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-base font-medium text-foreground">
              Overall Progress
            </span>
            <span className="text-base font-medium text-primary">
              {Math.round(overallProgress)}%
            </span>
          </div>
          <div className="w-full bg-background rounded-full h-4 overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300 ease-out"
              style={{
                width: `${Math.min(100, Math.max(0, overallProgress))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Individual Step Progress */}
      {steps.map((step, _index) => {
        const isActive = step.status === 'active';
        const isCompleted = step.status === 'completed';
        const isFailed = step.status === 'failed';
        const isPending = step.status === 'pending';

        return (
          <div key={step.id} className="flex items-center gap-4">
            {/* Status Icon - Larger */}
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
              {isCompleted && (
                <HiCheckCircle className="h-8 w-8 text-success" />
              )}
              {isFailed && <HiXCircle className="h-8 w-8 text-error" />}
              {isActive && <Spinner size={ComponentSize.MD} />}
              {isPending && (
                <div className="w-6 h-6 rounded-full border-2 border-white/[0.08]" />
              )}
            </div>

            {/* Step Label and Progress */}
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  'text-lg font-semibold mb-2',
                  isActive && 'text-primary',
                  isCompleted && 'text-success',
                  isFailed && 'text-error',
                  isPending && 'text-foreground/60',
                )}
              >
                {step.label}
              </div>

              {/* Progress Bar - Larger */}
              {isActive && step.progress !== undefined && (
                <div className="w-full bg-background rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-out shadow-sm"
                    style={{
                      width: `${Math.min(100, Math.max(0, step.progress))}%`,
                    }}
                  />
                </div>
              )}
              {isCompleted && (
                <div className="w-full bg-background rounded-full h-3 overflow-hidden shadow-inner">
                  <div className="h-full bg-success w-full shadow-sm" />
                </div>
              )}
              {isFailed && (
                <div className="w-full bg-background rounded-full h-3 overflow-hidden shadow-inner">
                  <div className="h-full bg-error w-full shadow-sm" />
                </div>
              )}
              {isPending && (
                <div className="w-full bg-background rounded-full h-3 overflow-hidden shadow-inner opacity-50" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

'use client';

import {
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@genfeedai/helpers/formatting/format/format.helper';

export interface VideoCompletionData {
  started: number; // 100% of viewers
  completed25: number;
  completed50: number;
  completed75: number;
  completed100: number;
}

export interface VideoCompletionFunnelProps {
  data: VideoCompletionData;
  isLoading?: boolean;
  height?: number;
  className?: string;
}

export function VideoCompletionFunnel({
  data,
  isLoading = false,
  height = 350,
  className = '',
}: VideoCompletionFunnelProps) {
  const stages = [
    { label: 'Started', percentage: 100, value: data.started },
    {
      label: '25% Complete',
      percentage: (data.completed25 / data.started) * 100,
      value: data.completed25,
    },
    {
      label: '50% Complete',
      percentage: (data.completed50 / data.started) * 100,
      value: data.completed50,
    },
    {
      label: '75% Complete',
      percentage: (data.completed75 / data.started) * 100,
      value: data.completed75,
    },
    {
      label: '100% Complete',
      percentage: (data.completed100 / data.started) * 100,
      value: data.completed100,
    },
  ];

  // Calculate drop-off rates
  const dropOffs = [
    {
      from: 'Started',
      rate: ((data.started - data.completed25) / data.started) * 100,
      to: '25%',
    },
    {
      from: '25%',
      rate: ((data.completed25 - data.completed50) / data.completed25) * 100,
      to: '50%',
    },
    {
      from: '50%',
      rate: ((data.completed50 - data.completed75) / data.completed50) * 100,
      to: '75%',
    },
    {
      from: '75%',
      rate: ((data.completed75 - data.completed100) / data.completed75) * 100,
      to: '100%',
    },
  ];

  const getBarColor = (percentage: number) => {
    if (percentage >= 75) {
      return 'bg-success';
    }
    if (percentage >= 50) {
      return 'bg-warning';
    }
    if (percentage >= 25) {
      return 'bg-error';
    }
    return 'bg-muted';
  };

  const isEmpty = data.started === 0;

  return (
    <div className={className}>
      {/* Funnel Visualization */}
      <div className="relative" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 z-10">
            <span className="animate-pulse w-12 h-12 rounded-full bg-primary/30" />
          </div>
        )}

        {isEmpty && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-foreground/50">
            No video completion data available
          </div>
        )}

        {!isEmpty && !isLoading && (
          <div className="space-y-4">
            {stages.map((stage, index) => (
              <div key={stage.label} className="space-y-2">
                {/* Stage Bar */}
                <div className="flex items-center gap-4">
                  <div className="w-32 text-sm font-medium">{stage.label}</div>
                  <div className="flex-1">
                    <div className="relative h-12 bg-muted overflow-hidden">
                      <div
                        className={`h-full ${getBarColor(stage.percentage)} transition-all duration-500 flex items-center justify-end px-4`}
                        style={{ width: `${stage.percentage}%` }}
                      >
                        <span className="text-sm font-bold text-white">
                          {formatPercentageSimple(stage.percentage)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="w-24 text-right">
                    <div className="font-mono font-semibold">
                      {formatCompactNumberIntl(stage.value)}
                    </div>
                    <div className="text-xs text-foreground/60">viewers</div>
                  </div>
                </div>

                {/* Drop-off indicator */}
                {index < stages.length - 1 && (
                  <div className="flex items-center gap-4 ml-32 pl-4">
                    <div className="text-xs text-error flex items-center gap-2">
                      <span>↓</span>
                      <span className="font-semibold">
                        {formatPercentageSimple(dropOffs[index].rate)} drop-off
                      </span>
                      <span className="text-foreground/50">
                        (
                        {formatCompactNumberIntl(
                          stages[index].value - stages[index + 1].value,
                        )}{' '}
                        viewers)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {!isEmpty && !isLoading && (
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/[0.08]">
          <div className="text-center">
            <div className="text-2xl font-bold text-success">
              {formatPercentageSimple((data.completed100 / data.started) * 100)}
            </div>
            <div className="text-xs text-foreground/60 mt-1">
              Completion Rate
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {formatPercentageSimple((data.completed50 / data.started) * 100)}
            </div>
            <div className="text-xs text-foreground/60 mt-1">Watched 50%+</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-warning">
              {formatCompactNumberIntl(data.started - data.completed100)}
            </div>
            <div className="text-xs text-foreground/60 mt-1">Didn't Finish</div>
          </div>
        </div>
      )}
    </div>
  );
}

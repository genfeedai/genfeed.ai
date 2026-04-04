'use client';

import type { AgentRunAnomaly, AgentRunStats } from '@genfeedai/types';

interface RunAnomaliesPanelProps {
  stats: AgentRunStats | null;
}

function getSeverityClass(severity: AgentRunAnomaly['severity']): string {
  switch (severity) {
    case 'critical':
      return 'border-red-500/40 bg-red-500/10 text-red-300';
    case 'warning':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'info':
    default:
      return 'border-sky-500/40 bg-sky-500/10 text-sky-300';
  }
}

export default function RunAnomaliesPanel({ stats }: RunAnomaliesPanelProps) {
  const anomalies = stats?.anomalies ?? [];

  return (
    <div className="gen-card flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Routing Anomalies
        </h2>
        <p className="text-xs text-muted-foreground">
          Baseline comparison from the selected trend window.
        </p>
      </div>

      {anomalies.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No routing anomalies detected for this window.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {anomalies.map((anomaly) => (
            <div
              key={anomaly.kind}
              className={`rounded border p-3 ${getSeverityClass(anomaly.severity)}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{anomaly.title}</span>
                <span className="text-[10px] uppercase tracking-wider">
                  {anomaly.severity}
                </span>
              </div>
              <p className="mt-1 text-xs opacity-90">{anomaly.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

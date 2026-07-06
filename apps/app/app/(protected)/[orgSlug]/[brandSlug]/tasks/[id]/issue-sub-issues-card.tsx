'use client';

import type { Task, TaskStatus } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { SubIssueRow } from './sub-issue-row';

type IssueSubIssuesCardProps = {
  subIssues: Task[];
  statusColors: Record<TaskStatus, string>;
  statusLabels: Record<TaskStatus, string>;
};

export default function IssueSubIssuesCard({
  subIssues,
  statusColors,
  statusLabels,
}: IssueSubIssuesCardProps) {
  if (subIssues.length === 0) return null;

  const doneCount = subIssues.filter((c) => c.status === 'done').length;
  const pct =
    subIssues.length > 0 ? Math.round((doneCount / subIssues.length) * 100) : 0;

  return (
    <Card>
      <div className="border-b border-white/10 px-4 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Sub-issues ({subIssues.length})
          </h3>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500/60 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] text-white/30">
              {doneCount}/{subIssues.length}
            </span>
          </div>
        </div>
      </div>
      {subIssues.map((child) => (
        <SubIssueRow
          key={child.id}
          issue={child}
          statusColors={statusColors}
          statusLabels={statusLabels}
        />
      ))}
    </Card>
  );
}

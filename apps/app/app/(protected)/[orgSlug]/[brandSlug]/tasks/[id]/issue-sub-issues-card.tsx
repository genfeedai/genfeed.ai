'use client';

import type { Task, TaskStatus } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { SubIssueRow } from './sub-issue-row';

type IssueSubIssuesCardProps = {
  subIssues: Task[];
  statusLabels: Record<TaskStatus, string>;
};

export default function IssueSubIssuesCard({
  subIssues,
  statusLabels,
}: IssueSubIssuesCardProps) {
  if (subIssues.length === 0) return null;

  const doneCount = subIssues.filter((c) => c.status === 'done').length;
  const pct =
    subIssues.length > 0 ? Math.round((doneCount / subIssues.length) * 100) : 0;

  return (
    <Card>
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-800">
            Sub-issues ({subIssues.length})
          </h3>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success/60 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-2xs text-gray-800">
              {doneCount}/{subIssues.length}
            </span>
          </div>
        </div>
      </div>
      {subIssues.map((child) => (
        <SubIssueRow key={child.id} issue={child} statusLabels={statusLabels} />
      ))}
    </Card>
  );
}

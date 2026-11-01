import Card from '@ui/card/Card';
import { Progress } from '@ui/primitives/progress';
import type { IssueSubIssuesCardProps } from '@/features/tasks/props/issue-sub-issues-card.props';
import { SubIssueRow } from './sub-issue-row';

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
            <Progress className="w-16" size="sm" tone="success" value={pct} />
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

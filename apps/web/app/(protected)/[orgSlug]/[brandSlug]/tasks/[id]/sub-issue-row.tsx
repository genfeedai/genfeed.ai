import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { SubIssueRowProps } from '@/features/tasks/props/sub-issue-row.props';

export function SubIssueRow({ issue, statusLabels }: SubIssueRowProps) {
  const { href } = useOrgUrl();
  return (
    <Button
      asChild
      className="flex items-center gap-3 border-b border-border px-4 py-2 transition-colors hover:bg-muted/40"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <Link href={href(`${APP_ROUTES.WORKSPACE.TASKS}/${issue.identifier}`)}>
        <span className="text-xs font-mono text-gray-800">
          {issue.identifier}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {issue.title}
        </span>
        <Badge status={issue.status}>{statusLabels[issue.status]}</Badge>
      </Link>
    </Button>
  );
}

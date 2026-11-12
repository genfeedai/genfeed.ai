'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { usePrefetchOnIntent } from '@hooks/navigation/use-prefetch-on-intent/use-prefetch-on-intent';
import { Button } from '@ui/primitives/button';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useIsAppAvailable } from '@/components/shell/use-available-rail-apps';
import type { UsePatternButtonProps } from '@/props/analytics/performance-lab.props';

export default function UsePatternButton({ pattern }: UsePatternButtonProps) {
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const isAutomationAvailable = useIsAppAvailable('automation');

  const getIntentProps = usePrefetchOnIntent();

  // The page frame is prepared on intent; the pattern travels in the query.
  const workflowHref = href(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW);

  const createWorkflowFromPattern = useCallback(() => {
    const params = new URLSearchParams({
      formula: encodeURIComponent(pattern.formula),
      patternType: pattern.patternType,
    });
    push(`${workflowHref}?${params.toString()}`);
  }, [pattern.formula, pattern.patternType, push, workflowHref]);

  // The remix opens a new workflow in Automation.
  if (!isAutomationAvailable) {
    return null;
  }

  return (
    <Button
      variant={ButtonVariant.SECONDARY}
      onClick={createWorkflowFromPattern}
      {...getIntentProps(workflowHref)}
    >
      <Sparkles className="size-3.5" />
      Remix with this
    </Button>
  );
}

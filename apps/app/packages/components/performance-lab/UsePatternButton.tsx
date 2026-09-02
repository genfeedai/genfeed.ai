'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { UsePatternButtonProps } from '@props/analytics/performance-lab.props';
import { Button } from '@ui/primitives/button';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export default function UsePatternButton({ pattern }: UsePatternButtonProps) {
  const { push } = useRouter();
  const { href } = useOrgUrl();

  const createWorkflowFromPattern = useCallback(() => {
    const params = new URLSearchParams({
      formula: encodeURIComponent(pattern.formula),
      patternType: pattern.patternType,
    });
    push(href(`${APP_ROUTES.AUTOMATION.WORKFLOWS_NEW}?${params.toString()}`));
  }, [pattern.formula, pattern.patternType, push, href]);

  return (
    <Button
      variant={ButtonVariant.SECONDARY}
      onClick={createWorkflowFromPattern}
    >
      <Sparkles className="size-3.5" />
      Remix with this
    </Button>
  );
}

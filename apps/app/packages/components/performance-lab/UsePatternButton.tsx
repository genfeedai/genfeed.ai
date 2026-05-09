'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { UsePatternButtonProps } from '@props/analytics/performance-lab.props';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi2';

export default function UsePatternButton({ pattern }: UsePatternButtonProps) {
  const { push } = useRouter();
  const { href } = useOrgUrl();

  const createWorkflowFromPattern = useCallback(() => {
    const params = new URLSearchParams({
      formula: encodeURIComponent(pattern.formula),
      patternType: pattern.patternType,
    });
    push(href(`/workflows/new?${params.toString()}`));
  }, [pattern.formula, pattern.patternType, push, href]);

  return (
    <Button
      variant={ButtonVariant.SECONDARY}
      onClick={createWorkflowFromPattern}
    >
      <HiOutlineSparkles className="size-3.5" />
      Remix with this
    </Button>
  );
}

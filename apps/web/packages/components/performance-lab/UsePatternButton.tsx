'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { UsePatternButtonProps } from '@props/analytics/performance-lab.props';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { HiOutlineSparkles } from 'react-icons/hi2';

export default function UsePatternButton({ pattern }: UsePatternButtonProps) {
  const router = useRouter();

  const handleClick = useCallback(() => {
    const params = new URLSearchParams({
      formula: encodeURIComponent(pattern.formula),
      patternType: pattern.patternType,
    });
    router.push(`/workflows/new?${params.toString()}`);
  }, [pattern.formula, pattern.patternType, router]);

  return (
    <Button variant={ButtonVariant.SECONDARY} onClick={handleClick}>
      <HiOutlineSparkles className="w-3.5 h-3.5" />
      Remix with this
    </Button>
  );
}

'use client';

import { useEnabledCategories } from '@hooks/data/organization/use-enabled-categories/use-enabled-categories';
import type { GenerationFeatureGuardProps } from '@props/guards/generation-feature-guard.props';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Guards generation pages based on organization feature flags.
 * Redirects to /studio if the feature is disabled.
 * Shows a loading skeleton while feature flags are being fetched.
 */
export default function GenerationFeatureGuard({
  category,
  children,
}: GenerationFeatureGuardProps) {
  const { isEnabled, isLoading } = useEnabledCategories();
  const router = useRouter();

  const categoryEnabled = isEnabled(category);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!categoryEnabled) {
      router.replace('/studio');
    }
  }, [categoryEnabled, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6 animate-pulse">
        <div className="h-10 w-full bg-white/[0.04] rounded" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
              key={`skeleton-${i}`}
              className="aspect-[3/4] bg-white/[0.04] rounded"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!categoryEnabled) {
    return null;
  }

  return <>{children}</>;
}

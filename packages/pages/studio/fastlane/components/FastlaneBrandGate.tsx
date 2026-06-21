'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import type { BrandReadinessResult } from '../utils/brand-readiness';

interface FastlaneBrandGateProps {
  readiness: BrandReadinessResult;
  children: ReactNode;
}

export default function FastlaneBrandGate({
  readiness,
  children,
}: FastlaneBrandGateProps) {
  const params = useParams<{ orgSlug: string; brandSlug: string }>();

  if (readiness.ready) {
    return <>{children}</>;
  }

  const settingsHref =
    params?.orgSlug && params?.brandSlug
      ? `/${params.orgSlug}/${params.brandSlug}/settings`
      : '/settings';

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 px-4 text-center">
      <div className="flex flex-col gap-2 max-w-md">
        <h2 className="gen-heading-lg">Brand not ready for Fastlane</h2>
        <p className="text-sm text-muted-foreground">
          Complete the following before using Fastlane:
        </p>
      </div>

      <ul className="flex flex-col gap-2 text-left w-full max-w-sm">
        {readiness.reasons.map((reason) => (
          <li
            key={reason}
            className="flex items-start gap-2 text-sm text-muted-foreground"
          >
            <span className="gen-dot gen-dot-warning mt-1 shrink-0" />
            {reason}
          </li>
        ))}
      </ul>

      <Link href={settingsHref}>
        <Button variant={ButtonVariant.DEFAULT} label="Go to Brand Settings" />
      </Link>
    </div>
  );
}

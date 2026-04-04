'use client';

import type { ReferralProps } from '@props/content/referral.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import Link from 'next/link';
import { HiShare, HiSparkles } from 'react-icons/hi2';

export default function Referral({ referralCode }: ReferralProps) {
  return (
    <Card>
      <div className="flex justify-center mb-4">
        <div className="p-3 bg-primary/10 rounded-full">
          <HiSparkles className="w-8 h-8 text-primary" />
        </div>
      </div>

      <h3 className="flex justify-center font-semibold text-xl mb-2">
        Scale Your Content
      </h3>

      <p className="text-foreground/70 mb-6 text-center">
        Generate professional social media content that drives business results.
        Save hours weekly while maintaining consistent brand presence across all
        platforms.
      </p>

      <div className="flex justify-center uppercase">
        <Link
          href={`${EnvironmentService.apps.app}/request-access`}
          className="inline-flex items-center justify-center gap-2 h-9 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90"
        >
          <HiShare className="w-4 h-4" />
          Request Access
        </Link>
      </div>

      {referralCode && (
        <div className="mt-4 p-3 bg-background">
          <p className="text-sm text-foreground/60">
            Referral code:
            <span className="font-mono font-semibold">{referralCode}</span>
          </p>
        </div>
      )}
    </Card>
  );
}

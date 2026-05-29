'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';

type Props = {
  isInvalidating: boolean;
  onInvalidateCloudFront: () => void;
};

export default function CloudFrontSection({
  isInvalidating,
  onInvalidateCloudFront,
}: Props) {
  return (
    <WorkspaceSurface
      title="CloudFront"
      tone="muted"
      data-testid="darkroom-cloudfront-surface"
    >
      <Card className="border-0 bg-transparent shadow-none">
        <div className="p-6 flex items-center justify-between">
          <div>
            <p className="font-medium">Cache Invalidation</p>
            <p className="text-sm text-foreground/60">
              Invalidate CloudFront distribution cache for all paths
            </p>
          </div>

          <Button
            variant={ButtonVariant.DEFAULT}
            isDisabled={isInvalidating}
            isLoading={isInvalidating}
            onClick={onInvalidateCloudFront}
            label={isInvalidating ? 'Invalidating...' : 'Invalidate Cache'}
          />
        </div>
      </Card>
    </WorkspaceSurface>
  );
}

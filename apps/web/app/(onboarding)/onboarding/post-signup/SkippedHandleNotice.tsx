import { CardGap } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import type { SkippedHandleNoticeProps } from '@/features/onboarding/props/skipped-handle-notice.props';

export default function SkippedHandleNotice({
  handle,
  onContinue,
}: SkippedHandleNoticeProps) {
  return (
    <Card className="mt-2" gap={CardGap.NONE}>
      <p className="mb-1 text-sm font-medium text-foreground">
        @{handle} was not applied
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Your organization has several brands, so Genfeed did not choose one for
        you and none of your brand handles changed. Once setup is done, choose
        which brand takes @{handle} in Settings, then Brands.
      </p>
      <Button label="Continue" onClick={onContinue} className="h-8 px-3" />
    </Card>
  );
}

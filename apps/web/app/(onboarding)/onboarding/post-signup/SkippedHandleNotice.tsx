import { ButtonSize, CardGap } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { SkippedHandleNoticeProps } from '@/features/onboarding/props/skipped-handle-notice.props';

export default function SkippedHandleNotice({
  handle,
  onContinue,
}: SkippedHandleNoticeProps) {
  const translate = useTranslations('common.onboarding.skippedHandle');

  return (
    <Card className="mt-2" gap={CardGap.NONE}>
      <p className="mb-1 text-sm font-medium text-foreground">
        {translate('title', { handle })}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        {translate('description', { handle })}
      </p>
      <Button
        label={translate('continue')}
        onClick={onContinue}
        size={ButtonSize.SM}
      />
    </Card>
  );
}

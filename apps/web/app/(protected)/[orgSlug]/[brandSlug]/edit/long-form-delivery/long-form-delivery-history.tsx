import {
  ButtonSize,
  ButtonVariant,
  formatEnumLabel,
} from '@genfeedai/contracts';
import { toConnectedAccount } from '@helpers/publisher/connected-account.helper';
import ConnectedAccount from '@ui/display/connected-account/ConnectedAccount';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { ExternalLink } from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import type { LongFormDeliveryHistoryProps } from '@/props/edit/long-form-delivery.props';

/** Where an Article or Newsletter was delivered, newest first. */
export default function LongFormDeliveryHistory({
  credentials,
  targets,
}: LongFormDeliveryHistoryProps) {
  const translate = useTranslations('common.longFormDelivery');

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-label text-foreground/60">
        {translate('history')}
      </p>
      {targets.length === 0 ? (
        <p className="text-sm text-foreground/60">
          {translate('historyEmpty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {targets.map((target) => {
            const credential = credentials.find(
              (item) => item.id === target.credentialId,
            );

            return (
              <li
                key={target.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <ConnectedAccount
                  account={
                    credential
                      ? toConnectedAccount(credential)
                      : { platform: target.platform }
                  }
                  layout="stacked"
                />
                <div className="flex items-center gap-2">
                  <Badge status={target.executionState}>
                    {formatEnumLabel(target.executionState)}
                  </Badge>
                  {target.url ? (
                    <Button
                      asChild
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      withWrapper={false}
                    >
                      <NextLink
                        href={target.url}
                        target="_blank"
                        rel="noopener"
                      >
                        <ExternalLink className="size-4" />
                        {translate('open')}
                      </NextLink>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

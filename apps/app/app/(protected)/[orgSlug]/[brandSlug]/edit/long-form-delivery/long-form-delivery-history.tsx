import {
  ButtonSize,
  ButtonVariant,
  formatEnumLabel,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import type { LongFormDeliveryHistoryProps } from '@props/edit/long-form-delivery.props';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { ExternalLink } from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';

/** Where an Article or Newsletter was delivered, newest first. */
export default function LongFormDeliveryHistory({
  credentials,
  targets,
}: LongFormDeliveryHistoryProps) {
  const translate = useTranslations('common.longFormDelivery');

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-foreground/60">
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
            const platformLabel =
              formatPlatformLabel(target.platform) ?? target.platform;
            const accountLabel =
              credential?.label ||
              credential?.externalName ||
              credential?.externalHandle ||
              platformLabel;

            return (
              <li
                key={target.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{accountLabel}</p>
                  <p className="text-xs text-foreground/60">{platformLabel}</p>
                </div>
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

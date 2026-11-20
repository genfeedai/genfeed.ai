'use client';

import type { SocialWarmupCheckItemProps } from '@props/social/social-warmup-program.props';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type CheckState = SocialWarmupCheckItemProps['check']['state'];
type CheckProvenance = SocialWarmupCheckItemProps['check']['provenance'];

const STATE_MESSAGE_KEYS: Partial<Record<CheckState, string>> = {
  empty: 'checkEmpty',
  failed: 'checkFailed',
  loading: 'checkLoading',
  missing: 'checkMissing',
  permission_limited: 'checkPermissionLimited',
  reconnect: 'checkReconnect',
  stale: 'checkStale',
};

const SOURCE_KEYS: Record<CheckProvenance, string> = {
  genfeed_observed: 'sourceGenfeed',
  platform_verified: 'sourcePlatform',
  user_confirmed: 'sourceUser',
};

export default function SocialWarmupCheckItem({
  check,
  focusedCheckId,
  isPending = false,
  onComplete,
  onReopen,
  platformLabel,
}: SocialWarmupCheckItemProps) {
  const translate = useTranslations('pages.socialWarmup');
  const isFocused = focusedCheckId === check.id;
  // The row opens when the "unresolved" list points at it; the user's own
  // click wins from then on.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const isOpen = manualOpen ?? isFocused;

  const isUserConfirmed = check.provenance === 'user_confirmed';
  const stateMessageKey = isUserConfirmed
    ? undefined
    : STATE_MESSAGE_KEYS[check.state];

  return (
    <article
      aria-labelledby={`warmup-check-title-${check.id}`}
      className={`border-t border-border/70 first:border-t-0 ${
        isFocused ? 'bg-primary/5' : ''
      }`}
      data-check-state={check.state}
      id={`warmup-check-${check.id}`}
      tabIndex={-1}
    >
      <Collapsible onOpenChange={setManualOpen} open={isOpen}>
        <div className="flex items-start gap-3">
          <CollapsibleTrigger className="items-start gap-3 py-3 text-left hover:no-underline [&>svg]:mt-1 [&>svg]:text-muted-foreground">
            <span className="min-w-0 flex-1 space-y-1">
              <span
                className="block text-sm font-medium"
                id={`warmup-check-title-${check.id}`}
              >
                {check.title}
              </span>
              <span className="block text-xs leading-5 font-normal text-muted-foreground">
                {check.description}
              </span>
            </span>
          </CollapsibleTrigger>
          <div className="shrink-0 pt-3.5">
            <Switch
              aria-label={check.title}
              checked={check.isComplete}
              isDisabled={isPending || !isUserConfirmed}
              onCheckedChange={(isChecked) =>
                isChecked ? onComplete(check.id) : onReopen(check.id)
              }
            />
          </div>
        </div>

        <CollapsibleContent>
          <div className="space-y-2 text-xs leading-5 text-muted-foreground">
            <p>
              {translate(SOURCE_KEYS[check.provenance], {
                platform: platformLabel,
              })}
            </p>
            {stateMessageKey ? (
              <p>{translate(stateMessageKey, { platform: platformLabel })}</p>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </article>
  );
}

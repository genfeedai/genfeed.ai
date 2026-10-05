'use client';

import { CardVariant } from '@genfeedai/contracts';
import {
  PLATFORM_FLAG_PARENTS,
  type PlatformFlagKey,
} from '@genfeedai/contracts/constants';
import type { AdminFlagCardProps } from '@props/admin/admin-flags.props';
import Card from '@ui/card/Card';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';

/**
 * One module (or platform feature) on Admin → Flags: its own switch in the
 * header and every surface or feature it gates listed flat underneath, so an
 * operator reads a module at a glance instead of walking a tree.
 */
export default function AdminFlagCard({
  effectiveFlags,
  flagKey,
  flags,
  isDisabled,
  nestedKeys,
  onToggle,
}: AdminFlagCardProps) {
  const translate = useTranslations('pages.adminFlags');
  const label = translate(`flags.${flagKey}.label`);

  /** The highest switched-off flag above `key`, which is what keeps it off. */
  function blockingAncestorOf(key: PlatformFlagKey): PlatformFlagKey | null {
    let blocking: PlatformFlagKey | null = null;
    let parent = PLATFORM_FLAG_PARENTS[key];
    while (parent !== undefined) {
      if (!flags[parent]) {
        blocking = parent;
      }
      parent = PLATFORM_FLAG_PARENTS[parent];
    }
    return blocking;
  }

  function describe(key: PlatformFlagKey): string {
    const description = translate(`flags.${key}.description`);
    const parent = PLATFORM_FLAG_PARENTS[key];
    const blocking = blockingAncestorOf(key);
    const notes: string[] = [];

    // Nested deeper than the card's own flag: say which row it depends on.
    if (parent !== undefined && parent !== flagKey) {
      notes.push(
        translate('needsParent', {
          parent: translate(`flags.${parent}.label`),
        }),
      );
    }
    if (blocking !== null && !effectiveFlags[key]) {
      notes.push(
        translate('inactiveUnderParent', {
          parent: translate(`flags.${blocking}.label`),
        }),
      );
    }

    return [description, ...notes].join(' ');
  }

  return (
    <Card
      data-testid={`flag-card-${flagKey}`}
      variant={CardVariant.BORDERED}
      label={label}
      description={translate(`flags.${flagKey}.description`)}
      headerAction={
        <Switch
          aria-label={label}
          isChecked={flags[flagKey]}
          isDisabled={isDisabled}
          onCheckedChange={(isOn) => onToggle(flagKey, isOn)}
        />
      }
    >
      {nestedKeys.length > 0 ? (
        <div className="flex flex-col divide-y divide-border border-t border-border">
          {nestedKeys.map((key) => (
            <div key={key} className="py-3 last:pb-0">
              <Switch
                aria-label={translate(`flags.${key}.label`)}
                label={translate(`flags.${key}.label`)}
                description={describe(key)}
                isChecked={flags[key]}
                isDisabled={isDisabled || blockingAncestorOf(key) !== null}
                onCheckedChange={(isOn) => onToggle(key, isOn)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

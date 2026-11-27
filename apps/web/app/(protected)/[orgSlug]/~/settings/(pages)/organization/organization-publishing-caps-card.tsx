import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  PUBLISHING_QUOTA_CEILINGS,
  type PublishingQuotaTier,
  resolveEffectivePublishingQuota,
  resolvePublishingQuotaCeiling,
} from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Slider } from '@ui/primitives/slider';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type {
  PublishingCapField,
  PublishingCapKey,
  PublishingCapsFormState,
} from '@/features/settings/props/organization-publishing-caps-card.props';
import { useOrganization } from '@/hooks/data/organization/use-organization/use-organization';
import { useSaveQueue } from '@/hooks/utils/use-save-queue/use-save-queue';

const PUBLISHING_CAP_FIELDS: PublishingCapField[] = [
  { id: 'org-quota-twitter', key: 'quotaTwitter', labelKey: 'twitter' },
  { id: 'org-quota-instagram', key: 'quotaInstagram', labelKey: 'instagram' },
  { id: 'org-quota-youtube', key: 'quotaYoutube', labelKey: 'youtube' },
  { id: 'org-quota-tiktok', key: 'quotaTiktok', labelKey: 'tiktok' },
];

/** The slider tops out here where no tier sets a ceiling (self-hosted). */
const UNMETERED_SLIDER_MAX = 100;

export default function OrganizationPublishingCapsCard() {
  const { organizationId } = useBrand();
  return <PublishingCapsForm key={organizationId} />;
}

function PublishingCapsForm() {
  const translate = useTranslations('common.settings.publishingCaps');
  const notifications = NotificationsService.getInstance();
  const { orgHref } = useOrgUrl();
  const { settings, updateSettings } = useOrganization();
  const { enqueueSave, isSaving } = useSaveQueue();
  const [drafts, setDrafts] = useState<Partial<PublishingCapsFormState>>({});
  const pendingCaps = useRef(new Map<PublishingCapKey, { value: number }>());

  // A tier the server could not verify is shown with the credit ceilings.
  const tier: PublishingQuotaTier = settings?.publishingQuotaTier ?? 'credits';
  const isLocked = tier === 'trial';

  const saveCap = (key: PublishingCapKey, value: number) => {
    const pending = pendingCaps.current.get(key);
    if (value === pending?.value) {
      return;
    }

    if (!pending && value === settings?.[key]) {
      setDrafts((current) => ({ ...current, [key]: undefined }));
      return;
    }

    const save = { value };
    pendingCaps.current.set(key, save);
    void enqueueSave(async () => {
      try {
        await updateSettings(key, value);
        if (pendingCaps.current.get(key) === save) {
          setDrafts((current) =>
            current[key] === value ? { ...current, [key]: undefined } : current,
          );
        }
        notifications.success(translate('saved'));
      } catch {
        notifications.error(translate('saveFailed'));
      } finally {
        if (pendingCaps.current.get(key) === save) {
          pendingCaps.current.delete(key);
        }
      }
    });
  };

  const readValue = (key: PublishingCapKey): number =>
    drafts[key] ?? resolveEffectivePublishingQuota(tier, key, settings?.[key]);

  const readMax = (key: PublishingCapKey): number =>
    tier === 'unmetered'
      ? UNMETERED_SLIDER_MAX
      : resolvePublishingQuotaCeiling(tier, key);

  const readHint = (key: PublishingCapKey): string => {
    if (tier === 'trial') {
      return translate('hint.trial');
    }
    if (tier === 'credits') {
      return translate('hint.credits', {
        max: readMax(key),
        planMax: PUBLISHING_QUOTA_CEILINGS.plan[key],
      });
    }
    return tier === 'plan'
      ? translate('hint.plan', { max: readMax(key) })
      : translate('hint.unmetered');
  };

  return (
    <Card label={translate('cardLabel')} description={translate('helpText')}>
      <div className="flex flex-col gap-5">
        {PUBLISHING_CAP_FIELDS.map((field) => {
          const value = readValue(field.key);
          return (
            <Field
              key={field.key}
              label={translate(`platforms.${field.labelKey}`)}
              htmlFor={field.id}
            >
              <div className="flex items-center gap-4">
                <Slider
                  aria-label={translate(`platforms.${field.labelKey}`)}
                  disabled={isLocked}
                  id={field.id}
                  max={readMax(field.key)}
                  min={tier === 'unmetered' || isLocked ? 0 : 1}
                  onValueChange={([next]) =>
                    setDrafts((current) => ({ ...current, [field.key]: next }))
                  }
                  onValueCommit={([next]) => saveCap(field.key, next)}
                  step={1}
                  value={[value]}
                />
                <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                  {isLocked
                    ? translate('locked')
                    : value === 0
                      ? translate('noCap')
                      : translate('perDay', { count: value })}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                {isLocked ? <Lock aria-hidden className="size-3.5" /> : null}
                {readHint(field.key)}
              </p>
            </Field>
          );
        })}
      </div>
      {tier === 'trial' ? (
        <Alert className="mt-5" variant="note">
          <AlertDescription>{translate('notice.trial')}</AlertDescription>
          <AlertActions>
            <Button asChild size={ButtonSize.SM}>
              <Link href={APP_ROUTES.ONBOARDING.PLANS}>
                {translate('notice.choosePlan')}
              </Link>
            </Button>
          </AlertActions>
        </Alert>
      ) : null}
      {tier === 'credits' ? (
        <Alert className="mt-5" variant="info">
          <AlertTitle>{translate('notice.creditsTitle')}</AlertTitle>
          <AlertDescription>{translate('notice.creditsBody')}</AlertDescription>
          <AlertActions>
            <Button asChild size={ButtonSize.SM}>
              <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
                {translate('notice.choosePlan')}
              </Link>
            </Button>
          </AlertActions>
        </Alert>
      ) : null}
      {isSaving ? (
        <p role="status" className="mt-4 text-xs text-muted-foreground">
          {translate('saving')}
        </p>
      ) : null}
    </Card>
  );
}

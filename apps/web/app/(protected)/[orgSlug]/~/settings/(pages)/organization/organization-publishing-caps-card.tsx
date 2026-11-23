import { useBrand } from '@contexts/user/brand-context/brand-context';
import { PUBLISHING_QUOTA_MAX } from '@genfeedai/contracts/constants';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
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

const WHOLE_NUMBER_PATTERN = /^\d+$/;

function toFormValue(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}

function parseCap(value: string): number | null {
  const trimmed = value.trim();

  if (!WHOLE_NUMBER_PATTERN.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return parsed <= PUBLISHING_QUOTA_MAX ? parsed : null;
}

export default function OrganizationPublishingCapsCard() {
  const { organizationId } = useBrand();
  return <PublishingCapsForm key={organizationId} />;
}

function PublishingCapsForm() {
  const translate = useTranslations('common.settings.publishingCaps');
  const notifications = NotificationsService.getInstance();
  const { settings, updateSettings } = useOrganization();
  const { enqueueSave, isSaving } = useSaveQueue();
  const [drafts, setDrafts] = useState<Partial<PublishingCapsFormState>>({});
  const pendingCaps = useRef(new Map<PublishingCapKey, { value: number }>());

  const saveCap = (key: PublishingCapKey, rawValue: string) => {
    if (drafts[key] === undefined) {
      return;
    }

    const value = parseCap(rawValue);
    if (value === null) {
      notifications.error(translate('invalid', { max: PUBLISHING_QUOTA_MAX }));
      return;
    }

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
            current[key] === rawValue
              ? { ...current, [key]: undefined }
              : current,
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

  return (
    <Card label={translate('cardLabel')} description={translate('helpText')}>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {PUBLISHING_CAP_FIELDS.map((field) => (
          <Field
            key={field.key}
            label={translate(`platforms.${field.labelKey}`)}
            htmlFor={field.id}
          >
            <Input
              id={field.id}
              type="number"
              inputMode="numeric"
              min={0}
              max={PUBLISHING_QUOTA_MAX}
              step={1}
              value={drafts[field.key] ?? toFormValue(settings?.[field.key])}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDrafts((current) => ({ ...current, [field.key]: value }));
              }}
              onBlur={(event) => saveCap(field.key, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </Field>
        ))}
      </div>
      {isSaving ? (
        <p role="status" className="mt-4 text-xs text-muted-foreground">
          {translate('saving')}
        </p>
      ) : null}
    </Card>
  );
}

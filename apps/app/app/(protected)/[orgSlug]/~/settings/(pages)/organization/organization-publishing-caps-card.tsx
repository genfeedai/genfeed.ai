import { clearClientProtectedBootstrapCache } from '@contexts/providers/protected-bootstrap/client-protected-bootstrap';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { PUBLISHING_QUOTA_MAX } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import type {
  PublishingCapField,
  PublishingCapKey,
  PublishingCapsFormState,
} from '@props/settings/organization-publishing-caps-card.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

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
  const translate = useTranslations('common.settings.publishingCaps');
  const notifications = NotificationsService.getInstance();
  const { organizationId } = useBrand();
  const { refresh, settings } = useOrganization();
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [caps, setCaps] = useState<PublishingCapsFormState>({
    quotaInstagram: '',
    quotaTiktok: '',
    quotaTwitter: '',
    quotaYoutube: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCaps({
      quotaInstagram: toFormValue(settings?.quotaInstagram),
      quotaTiktok: toFormValue(settings?.quotaTiktok),
      quotaTwitter: toFormValue(settings?.quotaTwitter),
      quotaYoutube: toFormValue(settings?.quotaYoutube),
    });
  }, [
    settings?.quotaInstagram,
    settings?.quotaTiktok,
    settings?.quotaTwitter,
    settings?.quotaYoutube,
  ]);

  const handleCapChange = useCallback(
    (key: PublishingCapKey, value: string) => {
      setCaps((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!organizationId) {
      notifications.error('Organization context is unavailable');
      return;
    }

    const quotaInstagram = parseCap(caps.quotaInstagram);
    const quotaTiktok = parseCap(caps.quotaTiktok);
    const quotaTwitter = parseCap(caps.quotaTwitter);
    const quotaYoutube = parseCap(caps.quotaYoutube);

    if (
      quotaInstagram === null ||
      quotaTiktok === null ||
      quotaTwitter === null ||
      quotaYoutube === null
    ) {
      notifications.error(translate('invalid', { max: PUBLISHING_QUOTA_MAX }));
      return;
    }

    setIsSaving(true);

    try {
      const service = await getOrganizationsService();
      await service.patchSettings(organizationId, {
        quotaInstagram,
        quotaTiktok,
        quotaTwitter,
        quotaYoutube,
      });
      // Organization settings are part of the protected bootstrap payload;
      // drop its snapshot so the refetch does not restore the old caps.
      clearClientProtectedBootstrapCache();
      await refresh();
      notifications.success(translate('saved'));
    } catch (error) {
      logger.error('Failed to save organization publishing caps', error);
      notifications.error(translate('saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [
    caps,
    getOrganizationsService,
    notifications,
    organizationId,
    refresh,
    translate,
  ]);

  return (
    <Card
      label={translate('cardLabel')}
      description={translate('description')}
      bodyClassName="gap-3 p-4"
    >
      <div className="space-y-4">
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
                value={caps[field.key]}
                isDisabled={isSaving}
                onChange={(event) =>
                  handleCapChange(field.key, event.target.value)
                }
              />
            </Field>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">{translate('helpText')}</p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              handleSave().catch((error) => {
                logger.error(
                  'Failed to save organization publishing caps',
                  error,
                );
              });
            }}
            isDisabled={isSaving}
            withWrapper={false}
          >
            {isSaving ? translate('saving') : translate('save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

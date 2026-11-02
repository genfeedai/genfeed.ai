'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminWarmupAccountsService } from '@services/admin/warmup-accounts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  ConciergeFormState,
  ProvisionConciergeDialogProps,
} from '@/features/admin/props/concierge.props';

const INITIAL_FORM: ConciergeFormState = {
  brandName: '',
  guidance: '',
  leadEmail: '',
  leadFirstName: '',
  leadLastName: '',
  organizationName: '',
  websiteUrl: '',
};

/** Sets up a ready-to-use workspace for a sales lead: organization, brand, credits, starter content. */
export default function ProvisionConciergeDialog({
  isOpen,
  onClose,
  onProvisioned,
}: ProvisionConciergeDialogProps) {
  const translate = useTranslations('pages.warmupAccounts');
  const [form, setForm] = useState<ConciergeFormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const getService = useAuthedService((token: string) =>
    AdminWarmupAccountsService.getInstance(token),
  );

  function setField(field: keyof ConciergeFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const notifications = NotificationsService.getInstance();

    if (!form.leadEmail.trim()) {
      notifications.warning(translate('emailRequired'));
      return;
    }

    if (!form.organizationName.trim() || !form.brandName.trim()) {
      notifications.warning(translate('namesRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      const service = await getService();
      const account = await service.createWarmupAccount({
        brandName: form.brandName.trim(),
        guidance: form.guidance.trim() || undefined,
        leadEmail: form.leadEmail.trim(),
        leadFirstName: form.leadFirstName.trim() || undefined,
        leadLastName: form.leadLastName.trim() || undefined,
        organizationName: form.organizationName.trim(),
        websiteUrl: form.websiteUrl.trim() || undefined,
      });

      if (account.status === 'FAILED') {
        notifications.warning(translate('needsAttention'));
      } else {
        notifications.success(translate('provisioned'));
      }
      setForm(INITIAL_FORM);
      onProvisioned(account);
      onClose();
    } catch (error) {
      logger.error('Failed to create concierge account', error);
      notifications.error(translate('createError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) {
          onClose();
        }
      }}
    >
      <DialogContent
        size="md"
        aria-describedby="concierge-provision-description"
      >
        <DialogHeader>
          <DialogTitle>{translate('provision')}</DialogTitle>
          <DialogDescription id="concierge-provision-description">
            {translate('description')}
          </DialogDescription>
        </DialogHeader>
        <Form
          className="flex min-h-0 flex-1 flex-col"
          spacing="none"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={translate('leadEmail')}
                htmlFor="concierge-lead-email"
                isRequired
              >
                <Input
                  type="email"
                  required
                  value={form.leadEmail}
                  onChange={(event) =>
                    setField('leadEmail', event.target.value)
                  }
                  disabled={isSubmitting}
                  placeholder={translate('emailPlaceholder')}
                />
              </Field>
              <Field label={translate('website')} htmlFor="concierge-website">
                <Input
                  type="url"
                  value={form.websiteUrl}
                  onChange={(event) =>
                    setField('websiteUrl', event.target.value)
                  }
                  disabled={isSubmitting}
                  placeholder={translate('websitePlaceholder')}
                />
              </Field>
              <Field
                label={translate('firstName')}
                htmlFor="concierge-first-name"
              >
                <Input
                  value={form.leadFirstName}
                  onChange={(event) =>
                    setField('leadFirstName', event.target.value)
                  }
                  disabled={isSubmitting}
                  placeholder={translate('firstNamePlaceholder')}
                />
              </Field>
              <Field
                label={translate('lastName')}
                htmlFor="concierge-last-name"
              >
                <Input
                  value={form.leadLastName}
                  onChange={(event) =>
                    setField('leadLastName', event.target.value)
                  }
                  disabled={isSubmitting}
                  placeholder={translate('lastNamePlaceholder')}
                />
              </Field>
              <Field
                label={translate('organization')}
                htmlFor="concierge-organization"
                isRequired
              >
                <Input
                  required
                  value={form.organizationName}
                  onChange={(event) =>
                    setField('organizationName', event.target.value)
                  }
                  disabled={isSubmitting}
                  placeholder={translate('organizationPlaceholder')}
                />
              </Field>
              <Field
                label={translate('firstBrand')}
                htmlFor="concierge-brand"
                isRequired
              >
                <Input
                  required
                  value={form.brandName}
                  onChange={(event) =>
                    setField('brandName', event.target.value)
                  }
                  disabled={isSubmitting}
                  placeholder={translate('brandPlaceholder')}
                />
              </Field>
            </div>
            <Field label={translate('guidance')} htmlFor="concierge-guidance">
              <Textarea
                className="min-h-[120px]"
                value={form.guidance}
                onChange={(event) => setField('guidance', event.target.value)}
                disabled={isSubmitting}
                placeholder={translate('guidancePlaceholder')}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant={ButtonVariant.SECONDARY}
              label={translate('cancel')}
              isDisabled={isSubmitting}
              onClick={onClose}
            />
            <Button
              type="submit"
              isLoading={isSubmitting}
              label={
                isSubmitting
                  ? translate('provisioning')
                  : translate('provision')
              }
            />
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

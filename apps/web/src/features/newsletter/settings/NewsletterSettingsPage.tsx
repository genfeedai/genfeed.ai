'use client';

import { ButtonVariant, CardGap } from '@genfeedai/contracts';
import { NEWSLETTER_PAID_PRICE_MAX_CREDITS } from '@genfeedai/contracts/constants';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import { Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  NEWSLETTER_QUERY_KEY,
  useNewsletterService,
  useNewsletterSettings,
  useNewsletterUsage,
} from '@/features/newsletter/hooks/use-newsletter-module';
import NewsletterBrandGate from '@/features/newsletter/NewsletterBrandGate';
import type { NewsletterSettingsForm } from '@/features/newsletter/props/newsletter.props';

const EMPTY_FORM: NewsletterSettingsForm = {
  footerText: '',
  isAttributionEnabled: true,
  isWelcomeEnabled: false,
  paidPriceCredits: '',
  postalAddress: '',
  replyTo: '',
  senderName: '',
  welcomeBody: '',
  welcomeSubject: '',
};

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Sending settings for one brand (#9723). The brand logo, banner and colors
 * come from the brand kit; email goes out from the shared Genfeed domain with
 * the sender name set here.
 */
export default function NewsletterSettingsPage() {
  const translate = useTranslations('pages.publishing.newsletter.settings');
  const { brandId } = useCollectionScope();
  const queryClient = useQueryClient();
  const getService = useNewsletterService();
  const settings = useNewsletterSettings(brandId);
  const usage = useNewsletterUsage(brandId);
  const [form, setForm] = useState<NewsletterSettingsForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const canRemoveAttribution = usage.data ? usage.data.plan !== 'free' : false;

  useEffect(() => {
    const saved = settings.data;
    if (!saved) return;
    setForm({
      footerText: saved.footerText ?? '',
      isAttributionEnabled: saved.isAttributionEnabled,
      isWelcomeEnabled: saved.isWelcomeEnabled,
      paidPriceCredits:
        saved.paidPriceCredits === null ? '' : String(saved.paidPriceCredits),
      postalAddress: saved.postalAddress ?? '',
      replyTo: saved.replyTo ?? '',
      senderName: saved.senderName ?? '',
      welcomeBody: saved.welcomeBody ?? '',
      welcomeSubject: saved.welcomeSubject ?? '',
    });
  }, [settings.data]);

  function update(patch: Partial<NewsletterSettingsForm>): void {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function save(): Promise<void> {
    if (!brandId || isSaving) return;
    const price = form.paidPriceCredits.trim();
    const paidPriceCredits = price ? Number(price) : null;
    if (
      paidPriceCredits !== null &&
      !(
        Number.isInteger(paidPriceCredits) &&
        paidPriceCredits > 0 &&
        paidPriceCredits <= NEWSLETTER_PAID_PRICE_MAX_CREDITS
      )
    ) {
      NotificationsService.getInstance().error(
        translate('priceInvalid', {
          max: NEWSLETTER_PAID_PRICE_MAX_CREDITS.toLocaleString('en-US'),
        }),
      );
      return;
    }
    setIsSaving(true);
    try {
      const service = await getService();
      if (!service) throw new Error('Newsletter service unavailable');
      await service.updateSettings(brandId, {
        footerText: orNull(form.footerText),
        isAttributionEnabled: form.isAttributionEnabled,
        isWelcomeEnabled: form.isWelcomeEnabled,
        paidPriceCredits,
        postalAddress: orNull(form.postalAddress),
        replyTo: orNull(form.replyTo),
        senderName: orNull(form.senderName),
        welcomeBody: orNull(form.welcomeBody),
        welcomeSubject: orNull(form.welcomeSubject),
      });
      await queryClient.invalidateQueries({
        queryKey: [NEWSLETTER_QUERY_KEY, 'settings', brandId],
      });
      NotificationsService.getInstance().success(translate('saved'));
    } catch (error) {
      logger.error('Newsletter settings save failed', error);
      NotificationsService.getInstance().error(translate('saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  if (!brandId) {
    return (
      <Container icon={Settings2} label={translate('title')}>
        <NewsletterBrandGate title={translate('title')} />
      </Container>
    );
  }

  return (
    <Container
      icon={Settings2}
      label={translate('title')}
      titleVisibility="sr-only"
    >
      <Form
        spacing="section"
        className="max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Card gap={CardGap.LG} label={translate('sender')}>
          <Field
            helpText={translate('senderNameHelp')}
            htmlFor="newsletter-sender-name"
            label={translate('senderName')}
          >
            <Input
              id="newsletter-sender-name"
              maxLength={80}
              value={form.senderName}
              onChange={(event) => update({ senderName: event.target.value })}
            />
          </Field>
          <Field
            helpText={translate('replyToHelp')}
            htmlFor="newsletter-reply-to"
            label={translate('replyTo')}
          >
            <Input
              id="newsletter-reply-to"
              type="email"
              value={form.replyTo}
              onChange={(event) => update({ replyTo: event.target.value })}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            {translate('domainNote')}
          </p>
        </Card>

        <Card gap={CardGap.LG} label={translate('footer')}>
          <Field
            helpText={translate('postalAddressHelp')}
            htmlFor="newsletter-postal-address"
            label={translate('postalAddress')}
          >
            <Textarea
              id="newsletter-postal-address"
              rows={2}
              value={form.postalAddress}
              onChange={(event) =>
                update({ postalAddress: event.target.value })
              }
            />
          </Field>
          <Field
            htmlFor="newsletter-footer-text"
            label={translate('footerText')}
          >
            <Textarea
              id="newsletter-footer-text"
              rows={3}
              value={form.footerText}
              onChange={(event) => update({ footerText: event.target.value })}
            />
          </Field>
          <Switch
            description={
              canRemoveAttribution
                ? translate('attributionHelp')
                : translate('attributionPaidOnly')
            }
            isChecked={form.isAttributionEnabled}
            isDisabled={!canRemoveAttribution}
            label={translate('attribution')}
            onCheckedChange={(checked) =>
              update({ isAttributionEnabled: checked })
            }
          />
        </Card>

        <Card gap={CardGap.LG} label={translate('welcome')}>
          <Switch
            description={translate('welcomeHelp')}
            isChecked={form.isWelcomeEnabled}
            label={translate('welcomeEnabled')}
            onCheckedChange={(checked) => update({ isWelcomeEnabled: checked })}
          />
          {form.isWelcomeEnabled ? (
            <>
              <Field
                htmlFor="newsletter-welcome-subject"
                label={translate('welcomeSubject')}
              >
                <Input
                  id="newsletter-welcome-subject"
                  maxLength={200}
                  value={form.welcomeSubject}
                  onChange={(event) =>
                    update({ welcomeSubject: event.target.value })
                  }
                />
              </Field>
              <Field
                helpText={translate('welcomeBodyHelp')}
                htmlFor="newsletter-welcome-body"
                label={translate('welcomeBody')}
              >
                <Textarea
                  id="newsletter-welcome-body"
                  rows={6}
                  value={form.welcomeBody}
                  onChange={(event) =>
                    update({ welcomeBody: event.target.value })
                  }
                />
              </Field>
            </>
          ) : null}
        </Card>

        <Card gap={CardGap.LG} label={translate('paid')}>
          <Field
            helpText={translate('paidPriceHelp')}
            htmlFor="newsletter-paid-price"
            label={translate('paidPrice')}
          >
            <Input
              id="newsletter-paid-price"
              inputMode="numeric"
              max={NEWSLETTER_PAID_PRICE_MAX_CREDITS}
              min={1}
              type="number"
              value={form.paidPriceCredits}
              onChange={(event) =>
                update({ paidPriceCredits: event.target.value })
              }
            />
          </Field>
        </Card>

        <div>
          <Button
            isDisabled={!settings.data}
            isLoading={isSaving}
            label={translate('save')}
            type="submit"
            variant={ButtonVariant.DEFAULT}
          />
        </div>
      </Form>
    </Container>
  );
}

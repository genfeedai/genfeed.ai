'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { createPublishingCampaignRoute } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { CampaignCreateDialogProps } from '@props/content/campaign-setup.props';
import { CampaignsService } from '@services/content/campaigns.service';
import { logger } from '@services/core/logger.service';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

const EXAMPLES = ['launch', 'education', 'feature', 'stories'] as const;

export default function CampaignCreateDialog({
  onClose,
}: CampaignCreateDialogProps) {
  const t = useTranslations('pages.publishing.campaigns');
  const scope = useCollectionScope();
  const { brands } = useBrand();
  const { href } = useOrgUrl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    CampaignsService.getInstance(token),
  );
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const brandId =
    scope.pageScope === 'brand'
      ? (scope.brandId ?? '')
      : selectedBrandId || (brands.length === 1 ? (brands[0]?.id ?? '') : '');
  const [name, setName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const request = useRef({ fingerprint: '', key: '' });
  const isSubmitting = useRef(false);

  async function generate() {
    if (
      isSubmitting.current ||
      !name.trim() ||
      !isBrandResourceReady({ ...scope, brandId })
    )
      return;
    isSubmitting.current = true;
    setIsGenerating(true);
    setError('');
    const fingerprint = JSON.stringify([brandId, name.trim()]);
    if (request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const service = await getService();
      const campaign = await service.generatePlan({
        brandId,
        name: name.trim(),
        idempotencyKey: request.current.key,
      });
      await queryClient.invalidateQueries({ queryKey: ['publish-campaigns'] });
      router.push(href(createPublishingCampaignRoute(campaign.id)));
    } catch (cause) {
      logger.error('Failed to generate campaign plan', cause);
      setError(t('setup.failed'));
    } finally {
      isSubmitting.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isGenerating) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!isGenerating}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        onEscapeKeyDown={(event) => {
          if (isGenerating) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isGenerating) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('newCampaign')}</DialogTitle>
          <DialogDescription>{t('setup.description')}</DialogDescription>
        </DialogHeader>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          {scope.pageScope === 'org' && brands.length !== 1 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="campaign-brand">{t('columns.brand')}</Label>
              <Select
                value={brandId}
                onValueChange={setSelectedBrandId}
                disabled={isGenerating}
              >
                <SelectTrigger id="campaign-brand">
                  <SelectValue placeholder={t('selectBrand')} />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="campaign-idea">{t('setup.idea')}</Label>
            <Input
              autoFocus
              id="campaign-idea"
              value={name}
              maxLength={200}
              disabled={isGenerating}
              placeholder={t('setup.placeholder')}
              onChange={(event) => setName(event.target.value)}
            />
            <p className="text-sm text-muted">
              {t('setup.brandContext', {
                brand:
                  brands.find((brand) => brand.id === brandId)?.label ??
                  t('setup.selectedBrand'),
              })}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('setup.examples')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXAMPLES.map((example) => (
                <Button
                  key={example}
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  isDisabled={isGenerating}
                  className="h-auto min-w-0 justify-start whitespace-normal p-3 text-left"
                  onClick={() =>
                    setName(t(`setup.examplesList.${example}.idea`))
                  }
                >
                  <span className="flex flex-col gap-1">
                    <span>{t(`setup.examplesList.${example}.title`)}</span>
                    <span className="text-xs font-normal text-muted">
                      {t(`setup.examplesList.${example}.description`)}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <p className="text-sm text-muted">{t('setup.next')}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant={ButtonVariant.GHOST}
              isDisabled={isGenerating}
              onClick={onClose}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              isDisabled={
                isGenerating ||
                !name.trim() ||
                !isBrandResourceReady({ ...scope, brandId })
              }
            >
              <Sparkles className="size-4" />
              {t(isGenerating ? 'setup.generating' : 'setup.generate')}
            </Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

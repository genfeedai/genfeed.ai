'use client';

import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ModalBrandCreateProps } from '@genfeedai/props/modals/modal.props';
import Alert from '@ui/feedback/alert/Alert';
import { Modal } from '@ui/modals/compound/modal.compound';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import Spinner from '@ui/primitives/spinner';
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useModalBrandCreate } from './useModalBrandCreate';

/**
 * Dialog for creating a brand. An existing brand's detail lives in the right
 * context sidebar and on its settings page, not in a dialog.
 */
export default function ModalBrandCreate({
  isOpen,
  onClose,
  onConfirm,
  openKey,
}: ModalBrandCreateProps) {
  const translate = useTranslations('ui.brandCreate');
  const {
    canLoadFromWebsite,
    canSubmit,
    closeModalBrandCreate,
    error,
    form,
    isLoadingWebsite,
    isSubmitting,
    loadFromWebsite,
    onChange,
    onSubmit,
    websiteLoadError,
  } = useModalBrandCreate({ isOpen, onClose, onConfirm, openKey });

  const isBusy = isSubmitting || isLoadingWebsite;

  return (
    <Modal.Root
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeModalBrandCreate();
        }
      }}
    >
      <Modal.Content
        size="md"
        className="border-white/10 bg-secondary"
        aria-describedby="brand-create-description"
      >
        <Modal.Header>
          <Modal.Title>{translate('title')}</Modal.Title>
          <Modal.Description id="brand-create-description">
            {translate('description')}
          </Modal.Description>
        </Modal.Header>

        <Form
          className="flex min-h-0 flex-1 flex-col"
          spacing="none"
          onSubmit={(event) => {
            if (!canSubmit || isSubmitting) {
              event.preventDefault();
              return;
            }
            void onSubmit(event);
          }}
        >
          <Modal.Body className="space-y-4">
            {error ? (
              <Alert type={AlertCategory.ERROR}>
                <div className="space-y-1">{error}</div>
              </Alert>
            ) : null}

            {websiteLoadError ? (
              <Alert type={AlertCategory.ERROR}>
                <div className="space-y-1">{websiteLoadError}</div>
              </Alert>
            ) : null}

            <FormControl
              label={translate('website.label')}
              description={translate('website.description')}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Input
                    type="url"
                    name="websiteUrl"
                    control={form.control}
                    onChange={onChange}
                    placeholder={translate('website.placeholder')}
                    isDisabled={isBusy}
                  />
                </div>
                <Button
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  isDisabled={!canLoadFromWebsite}
                  isLoading={isLoadingWebsite}
                  icon={
                    isLoadingWebsite ? (
                      <Spinner className="size-4" />
                    ) : (
                      <Globe className="size-4" />
                    )
                  }
                  label={
                    isLoadingWebsite
                      ? translate('website.loading')
                      : translate('website.load')
                  }
                  onClick={() => {
                    void loadFromWebsite();
                  }}
                />
              </div>
            </FormControl>

            <FormControl label={translate('label.label')} isRequired>
              <Input
                type="text"
                name="label"
                control={form.control}
                onChange={onChange}
                placeholder={translate('label.placeholder')}
                isRequired
                isDisabled={isBusy}
              />
            </FormControl>

            <FormControl label={translate('slug.label')} isRequired>
              <Input
                type="text"
                name="slug"
                control={form.control}
                onChange={onChange}
                placeholder={translate('slug.placeholder')}
                isRequired
                isDisabled={isBusy}
              />
            </FormControl>

            <FormControl label={translate('descriptionField.label')}>
              <Input
                type="text"
                name="description"
                control={form.control}
                onChange={onChange}
                placeholder={translate('descriptionField.placeholder')}
                isDisabled={isBusy}
              />
            </FormControl>
          </Modal.Body>

          <Modal.Footer>
            <Modal.CloseButton asChild>
              <Button variant={ButtonVariant.SECONDARY} disabled={isBusy}>
                {translate('cancel')}
              </Button>
            </Modal.CloseButton>
            <Button
              type="submit"
              variant={ButtonVariant.DEFAULT}
              disabled={isBusy || !canSubmit}
            >
              {isSubmitting ? translate('submitting') : translate('submit')}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal.Content>
    </Modal.Root>
  );
}

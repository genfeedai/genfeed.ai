'use client';

import {
  type BrandGenerateSchema,
  brandGenerateSchema,
} from '@genfeedai/client/schemas';
import {
  AssetCategory,
  AssetParent,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/contracts';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import type { ModalBrandGenerateProps } from '@genfeedai/props/modals/modal.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Form } from '@ui/primitives/form';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';

const GENERATE_CATEGORY = {
  banner: AssetCategory.BANNER,
  logo: AssetCategory.LOGO,
} as const;

export default function ModalBrandGenerate({
  type,
  onConfirm,
  brandId,
}: ModalBrandGenerateProps) {
  const translate = useTranslations('ui.brandGenerate');
  const category = GENERATE_CATEGORY[type];
  const getAssetsService = useAuthedService((token) =>
    AssetsService.getInstance(token),
  );

  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const form = useForm<BrandGenerateSchema>({
    defaultValues: {
      prompt: '',
    },
    resolver: standardSchemaResolver(brandGenerateSchema),
  });

  const formRef = useRef<HTMLFormElement>(null);
  const prompt = form.watch('prompt');
  const hasPrompt = prompt.trim().length > 0;

  const closeAccountGenerateModal = useCallback(() => {
    closeModal(ModalEnum.BRAND_GENERATE);
    form.reset();
    onConfirmRef.current();
  }, [form]);

  const submitModalBrandGenerate = useCallback(async () => {
    if (!brandId) {
      logger.error('Brand ID is required for generation');
      return;
    }

    const url = `POST /assets/generate`;
    try {
      const service = await getAssetsService();
      const formData = form.getValues();

      await service.postGenerate({
        category,
        model: '',
        parentId: brandId,
        parentType: AssetParent.BRAND,
        text: formData.prompt.trim(),
      });

      logger.info(`${url} success`);
      closeAccountGenerateModal();
    } catch (error) {
      logger.error(`${url} failed`, error);
    }
  }, [brandId, category, getAssetsService, form, closeAccountGenerateModal]);

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    submitModalBrandGenerate(),
  );

  // The send control and Enter in the editor both go through the form so
  // validation and the in-flight guard stay in one place.
  const submitFromPrompt = () => {
    if (isSubmitting || !hasPrompt) {
      return;
    }
    formRef.current?.requestSubmit();
  };

  return (
    <Modal
      id={ModalEnum.BRAND_GENERATE}
      title={translate(`${type}.title`)}
      size="md"
    >
      <Form ref={formRef} onSubmit={onSubmit}>
        <PromptBarComposer
          data-testid="brand-generate-composer"
          density="compact"
          beforeBody={
            <p className="px-3.5 pt-2.5 text-2xs font-medium text-foreground/55">
              {translate(`${type}.label`)}
            </p>
          }
        >
          <PromptEditor
            ariaLabel={translate(`${type}.label`)}
            isAutoFocused
            value={prompt}
            isDisabled={isSubmitting}
            placeholder={translate(`${type}.placeholder`)}
            onValueChange={(value) =>
              form.setValue('prompt', value, { shouldValidate: true })
            }
            onSubmit={submitFromPrompt}
            className="min-h-24"
          />
          <PromptBarToolbar
            density="compact"
            leading={null}
            trailing={
              <PromptBarSendButton
                ariaLabel={translate('generate')}
                density="compact"
                isDisabled={isSubmitting || !hasPrompt}
                isLoading={isSubmitting}
                onClick={submitFromPrompt}
                tooltip={translate('generate')}
              />
            }
          />
        </PromptBarComposer>

        <ModalActions>
          <Button
            label={translate('cancel')}
            variant={ButtonVariant.SECONDARY}
            onClick={closeAccountGenerateModal}
            isLoading={isSubmitting}
          />
        </ModalActions>
      </Form>
    </Modal>
  );
}

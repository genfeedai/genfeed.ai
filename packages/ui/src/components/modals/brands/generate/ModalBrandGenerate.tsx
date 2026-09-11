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
import { useFocusFirstInput } from '@genfeedai/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import type { ModalBrandGenerateProps } from '@genfeedai/props/modals/modal.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Textarea } from '@ui/primitives/textarea';
import { ArrowUp } from 'lucide-react';
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

  const formRef = useFocusFirstInput<HTMLFormElement>();
  const hasPrompt = form.watch('prompt').trim().length > 0;

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

  return (
    <Modal
      id={ModalEnum.BRAND_GENERATE}
      title={translate(`${type}.title`)}
      size="md"
    >
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormControl label={translate(`${type}.label`)}>
          <Textarea
            name="prompt"
            control={form.control}
            placeholder={translate(`${type}.placeholder`)}
            isDisabled={isSubmitting}
            rows={4}
          />
        </FormControl>

        <ModalActions className="mt-0">
          <Button
            label={translate('cancel')}
            variant={ButtonVariant.SECONDARY}
            onClick={closeAccountGenerateModal}
            isLoading={isSubmitting}
          />

          <Button
            variant={ButtonVariant.DEFAULT}
            icon={<ArrowUp />}
            type="submit"
            label={translate('generate')}
            isDisabled={isSubmitting || !hasPrompt}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

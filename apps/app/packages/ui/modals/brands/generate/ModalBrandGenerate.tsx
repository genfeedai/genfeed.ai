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
} from '@genfeedai/enums';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import type { ModalBrandGenerateProps } from '@props/modals/modal.props';
import { AssetsService } from '@services/content/assets.service';
import { logger } from '@services/core/logger.service';
import Button from '@ui/buttons/base/Button';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { type ChangeEvent, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { HiArrowUp } from 'react-icons/hi2';

export default function ModalBrandGenerate({
  type,
  onConfirm,
  cost = 5,
  brandId,
}: ModalBrandGenerateProps) {
  const getAssetsService = useAuthedService((token) =>
    AssetsService.getInstance(token),
  );

  // Ref for callback to prevent re-renders
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const form = useForm<BrandGenerateSchema>({
    defaultValues: {
      description: '',
      prompt: '',
    },
    resolver: standardSchemaResolver(brandGenerateSchema),
  });

  const formRef = useFocusFirstInput<HTMLFormElement>();

  const closeAccountGenerateModal = useCallback(() => {
    closeModal(ModalEnum.BRAND_GENERATE);
    form.reset();
    onConfirmRef.current();
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!brandId) {
      logger.error('Brand ID is required for generation');
      return;
    }

    const url = `POST /assets/generate`;
    try {
      const service = await getAssetsService();
      const formData = form.getValues();

      // Use description if provided, otherwise use prompt
      const text = formData.description || formData.prompt;

      await service.postGenerate({
        category: type === 'logo' ? AssetCategory.LOGO : AssetCategory.BANNER,
        model: '', // Will be set by backend based on brand default
        parent: brandId,
        parentModel: AssetParent.BRAND,
        text: text,
      });

      logger.info(`${url} success`);
      closeAccountGenerateModal();
    } catch (error) {
      logger.error(`${url} failed`, error);
    }
  }, [brandId, getAssetsService, form, type, closeAccountGenerateModal]);

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    handleSubmit(),
  );

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as keyof BrandGenerateSchema, value, {
      shouldValidate: true,
    });
  };

  return (
    <Modal
      id={ModalEnum.BRAND_GENERATE}
      title={`Generate ${type === 'logo' ? 'Profile Picture' : 'Banner'}`}
    >
      <form ref={formRef} onSubmit={onSubmit}>
        <FormControl label="Prompt">
          <FormInput
            name="prompt"
            control={form.control}
            onChange={handleChange}
            placeholder="Enter a prompt"
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Description (optional)">
          <FormTextarea
            name="description"
            control={form.control}
            onChange={handleChange}
            placeholder="Describe what you want in the banner/logo"
            isDisabled={isSubmitting}
            rows={3}
          />
        </FormControl>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={closeAccountGenerateModal}
            isLoading={isSubmitting}
          />

          <Button
            variant={ButtonVariant.GENERATE}
            icon={<HiArrowUp />}
            type="submit"
            label={type === 'logo' ? 'Profile Picture' : 'Banner'}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

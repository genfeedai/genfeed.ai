import {
  type IngredientAvatarSchema,
  ingredientAvatarSchema,
} from '@genfeedai/client/schemas';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  ModalEnum,
} from '@genfeedai/enums';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import { Ingredient } from '@models/content/ingredient.model';
import type { ModalAvatarProps } from '@props/modals/modal.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Textarea } from '@ui/primitives/textarea';
import Image from 'next/image';
import { type ChangeEvent, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { HiArrowUp } from 'react-icons/hi2';

export default function ModalAvatar({
  avatarId,
  voiceId,
  text,
  onConfirm,
}: ModalAvatarProps) {
  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    handleSubmit(),
  );

  const form = useForm<IngredientAvatarSchema>({
    defaultValues: {
      avatar: '',
      category: 'avatar',
      text: '',
      voice: '',
    },
    resolver: standardSchemaResolver(ingredientAvatarSchema),
  });
  const formRef = useFocusFirstInput<HTMLFormElement>();

  useEffect(() => {
    if (avatarId && voiceId) {
      form.setValue('avatar', avatarId, { shouldValidate: true });
      form.setValue('voice', voiceId, { shouldValidate: true });
      form.setValue('text', text, { shouldValidate: true });
    }
  }, [avatarId, voiceId, text, form.setValue]);

  const closeAvatarModal = () => {
    closeModal(ModalEnum.AVATAR);
    form.reset();
  };

  const handleSubmit = async () => {
    const url = `POST /ingredients`;
    try {
      const service = await getIngredientsService();
      const mediaData = new Ingredient({
        ...form.getValues(),
        category: IngredientCategory.AVATAR,
      });

      const data = await service.post(form.getValues('category'), mediaData);
      logger.info(`${url} success`, data);
      closeAvatarModal();
    } catch (error) {
      logger.error(`${url} failed`, error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting && form.formState.isValid) {
        handleSubmit();
      }
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    form.setValue(name as keyof IngredientAvatarSchema, value, {
      shouldValidate: true,
    });
  };

  return (
    <Modal id={ModalEnum.AVATAR} title="Generate Video">
      <form ref={formRef} onSubmit={onSubmit}>
        <div className="w-full md:col-span-2 flex flex-col md:flex-row gap-4">
          <div className="relative aspect-[9/16] w-full md:w-1/2 h-auto">
            <Image
              src={`${EnvironmentService.ingredientsEndpoint}/avatars/${avatarId}`}
              alt="Avatar"
              width={1024}
              height={1024}
              className="w-full h-full object-cover object-center"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              priority
            />
          </div>

          <div className="flex flex-col gap-2 w-full md:w-1/2">
            <FormControl label="Text">
              <Textarea
                name="text"
                placeholder="Enter a text"
                control={form.control}
                onChange={handleChange}
                isDisabled={isSubmitting}
                onKeyDown={handleKeyDown}
              />
            </FormControl>
          </div>
        </div>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
            isLoading={isSubmitting}
            onClick={() => {
              form.reset();
              closeAvatarModal();
            }}
          />

          <Button
            variant={ButtonVariant.GENERATE}
            icon={<HiArrowUp />}
            type="submit"
            label="Video"
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

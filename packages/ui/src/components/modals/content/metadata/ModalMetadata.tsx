import {
  type MetadataWithScopeSchema,
  metadataWithScopeSchema,
} from '@genfeedai/client/schemas';
import {
  AlertCategory,
  AssetScope,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import type { ModalMetadataProps } from '@props/modals/modal.props';
import { FoldersService } from '@services/content/folders.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { type ChangeEvent, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

export default function ModalMetadata({
  ingredientId,
  ingredientCategory,
  metadata,
  scope = AssetScope.USER,
  folder,
  onConfirm,
  isOpen,
  openKey,
}: ModalMetadataProps) {
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const getFoldersService = useAuthedService((token: string) =>
    FoldersService.getInstance(token),
  );

  const [folders, setFolders] = useState<
    Array<{ value: string; label: string }>
  >([]);

  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

  const form = useForm<MetadataWithScopeSchema>({
    defaultValues: {
      description: metadata?.description,
      folder: folder?.id,
      label: metadata?.label,
      scope,
      tags: metadata?.tags?.map((tag) => tag.label) ?? [],
    },
    resolver: standardSchemaResolver(metadataWithScopeSchema),
  });

  const formRef = useFocusFirstInput<HTMLFormElement>();
  useModalAutoOpen(ModalEnum.METADATA, { isOpen, openKey });

  const closeModalMetadata = () => {
    closeModal(ModalEnum.METADATA);

    form.reset();
  };

  const handleSubmit = async () => {
    const url = `PATCH /${ingredientCategory}/${ingredientId}`;
    try {
      const service = await getIngredientsService();

      const formValues = form.getValues();
      const { scope, folder: folderId, ...metadataValues } = formValues;

      await service.patch(ingredientId, {
        folder: folderId || undefined,
        metadata: metadataValues,
        scope,
      });

      logger.info(`${url} success`);

      closeModalMetadata();
      onConfirm();
    } catch (error) {
      logger.error(`${url} failed`, error);
    }
  };

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    handleSubmit(),
  );

  const { setValue } = form;

  useEffect(() => {
    if (metadata) {
      setValue('label', metadata.label);
      setValue('description', metadata.description);
      setValue('tags', metadata.tags?.map((tag) => tag.label) ?? []);
      setValue('scope', scope);
      setValue('folder', folder?.id);
    }
  }, [metadata, scope, folder, setValue]);

  useEffect(() => {
    let isMounted = true;

    const loadFolders = async () => {
      setIsLoadingFolders(true);
      try {
        const service = await getFoldersService();
        const data = await service.findAll();
        const folderOptions = [
          { label: 'No folder', value: '' },
          ...data.map((f) => ({ label: f.label, value: f.id })),
        ];

        if (isMounted) {
          setFolders(folderOptions);
          setIsLoadingFolders(false);
        }
      } catch (error) {
        logger.error('Failed to load folders', error);
        if (isMounted) {
          setIsLoadingFolders(false);
        }
      }
    };

    loadFolders();

    return () => {
      isMounted = false;
    };
  }, [getFoldersService]); // getFoldersService is stable via ref pattern, safe to include

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    if (name === 'tags') {
      form.setValue(
        name as keyof MetadataWithScopeSchema,
        value.split(',').map((t) => t.trim()),
        { shouldValidate: true },
      );
    } else {
      form.setValue(name as keyof MetadataWithScopeSchema, value, {
        shouldValidate: true,
      });
    }
  };

  return (
    <Modal id={ModalEnum.METADATA} title="Metadata">
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <FormControl label="Label">
          <Input
            type="text"
            name="label"
            control={form.control}
            onChange={handleChange}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Description">
          <Textarea
            name="description"
            control={form.control}
            onChange={handleChange}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Tags">
          <Input
            type="text"
            name="tags"
            control={form.control}
            onChange={handleChange}
            placeholder="tag1, tag2"
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Folder">
          <SelectField
            name="folder"
            control={form.control}
            placeholder="Select a folder"
            isDisabled={isSubmitting || isLoadingFolders}
          >
            {folders.map((folder) => (
              <option key={folder.value} value={folder.value}>
                {folder.label}
              </option>
            ))}
          </SelectField>
        </FormControl>

        <FormControl label="Visibility Scope">
          <SelectField
            name="scope"
            control={form.control}
            placeholder="Select scope"
            isDisabled={isSubmitting}
          >
            <option value={AssetScope.USER}>User (Private)</option>
            <option value={AssetScope.BRAND}>Brand (Team Members)</option>
            <option value={AssetScope.ORGANIZATION}>
              Organization (All Members)
            </option>
            <option value={AssetScope.PUBLIC}>Public (Everyone)</option>
          </SelectField>
        </FormControl>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModalMetadata()}
            isLoading={isSubmitting}
          />

          <Button
            type="submit"
            label="Save"
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}

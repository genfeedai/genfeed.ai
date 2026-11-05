import {
  type MetadataWithScopeSchema,
  metadataWithScopeSchema,
} from '@genfeedai/client/schemas';
import { AssetScope, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import type { IFolder, IMetadata } from '@genfeedai/contracts/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedQuery } from '@genfeedai/hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ModalMetadataProps } from '@genfeedai/props/modals/modal.props';
import { FoldersService } from '@genfeedai/services/content/folders.service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { type ChangeEvent, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useFocusFirstInput } from '@/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useModalAutoOpen } from '@/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@/hooks/utils/use-form-submit/use-form-submit';

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

  // A reopened modal offers the cached folders at once and refreshes them in
  // the background.
  const foldersQuery = useAuthedQuery<FoldersService, IFolder[]>({
    queryFn: async (service, signal) => {
      try {
        return await service.findAll({}, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load folders', error);
        }
        throw error;
      }
    },
    queryKey: ['metadata-folder-options'],
    service: (token: string) => FoldersService.getInstance(token),
  });
  const isLoadingFolders = foldersQuery.isLoading;
  const folderRecords = foldersQuery.data;
  const folders = useMemo(
    () => [
      { label: 'No folder', value: '' },
      ...(folderRecords ?? []).map((f) => ({ label: f.label, value: f.id })),
    ],
    [folderRecords],
  );

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

  const submitModalMetadata = async () => {
    const url = `PATCH /${ingredientCategory}/${ingredientId}`;
    try {
      const service = await getIngredientsService();

      const formValues = form.getValues();
      const {
        scope,
        folder: folderId,
        tags: _tags,
        ...metadataValues
      } = formValues;
      const currentMetadata =
        metadata && typeof metadata === 'object' ? metadata : undefined;

      await service.patch(ingredientId, {
        folder: folderId || undefined,
        metadata: {
          ...(currentMetadata ?? { label: '' }),
          description: metadataValues.description,
          duration: metadataValues.duration,
          extension: metadataValues.extension,
          height: metadataValues.height,
          label: metadataValues.label ?? currentMetadata?.label ?? '',
          size: metadataValues.size,
          width: metadataValues.width,
        } as IMetadata,
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
    submitModalMetadata(),
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

  const updateModalMetadata = (
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
      <Form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert variant="destructive">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <FormControl label="Label">
          <Input
            type="text"
            name="label"
            control={form.control}
            onChange={updateModalMetadata}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Description">
          <Textarea
            name="description"
            control={form.control}
            onChange={updateModalMetadata}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Tags">
          <Input
            type="text"
            name="tags"
            control={form.control}
            onChange={updateModalMetadata}
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
      </Form>
    </Modal>
  );
}

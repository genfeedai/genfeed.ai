'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  isPersonaHandle,
  LibraryElementType,
  normalizePersonaHandle,
} from '@genfeedai/contracts';
import {
  MAX_CHARACTER_REFERENCES,
  MAX_LIBRARY_ELEMENT_DESCRIPTION_LENGTH,
} from '@genfeedai/contracts/constants';
import type { CreateLibraryElementInput } from '@genfeedai/contracts/interfaces';
import type { LibraryElement } from '@services/content/library-elements.service';
import { Badge } from '@ui/primitives/badge';
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
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import IngredientThumbnail from '@/components/ingredients/ingredient-thumbnail/IngredientThumbnail';
import { useIngredientsById } from '@/hooks/media/use-ingredients-by-id';

/** People type the handle the way they mention it, with the @. */
const LEADING_AT = /^\s*@/;

const ELEMENT_TYPES = [
  LibraryElementType.LOCATION,
  LibraryElementType.STYLE,
  LibraryElementType.PROP,
] as const;

interface ElementDialogProps {
  /** The element being edited; absent when creating a new one. */
  element?: LibraryElement;
  isBusy: boolean;
  onClose: () => void;
  onCreate: (input: CreateLibraryElementInput) => Promise<boolean>;
  onUpdate: (
    id: string,
    input: Partial<Omit<CreateLibraryElementInput, 'type'>>,
  ) => Promise<boolean>;
}

/** Creates a location, style or prop, or edits one: name, @handle, text and files. */
export default function ElementDialog({
  element,
  isBusy,
  onClose,
  onCreate,
  onUpdate,
}: ElementDialogProps) {
  const translate = useTranslations('pages.library.references.elements');
  const { openGallery } = useGalleryModal();
  const [type, setType] = useState<LibraryElementType>(
    element && element.kind !== 'CHARACTER'
      ? LibraryElementType[element.kind]
      : LibraryElementType.LOCATION,
  );
  const [label, setLabel] = useState(element?.label ?? '');
  const [handle, setHandle] = useState(element?.handle ?? '');
  const [description, setDescription] = useState(element?.description ?? '');
  const [fileIds, setFileIds] = useState<string[]>(
    element?.referenceIngredientIds ?? [],
  );
  const [isSubmitted, setIsSubmitted] = useState(false);
  const files = useIngredientsById(fileIds);
  const normalizedHandle = normalizePersonaHandle(
    handle.replace(LEADING_AT, ''),
  );
  const isHandleValid =
    normalizedHandle !== null && isPersonaHandle(normalizedHandle);
  const isFull = fileIds.length >= MAX_CHARACTER_REFERENCES;

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    const next = [...fileIds];
    const [moved] = next.splice(index, 1);
    if (moved === undefined || target < 0 || target >= fileIds.length) {
      return;
    }
    next.splice(target, 0, moved);
    setFileIds(next);
  };

  const addFiles = () => {
    openGallery({
      category: IngredientCategory.IMAGE,
      maxSelectableItems: MAX_CHARACTER_REFERENCES - fileIds.length,
      onSelect: (items) => {
        const added = items
          .filter((item) => !item.isDeleted && !fileIds.includes(item.id))
          .map((item) => item.id);
        setFileIds((current) =>
          [...current, ...added].slice(0, MAX_CHARACTER_REFERENCES),
        );
      },
      title: translate('files.galleryTitle'),
    });
  };

  const submit = async () => {
    setIsSubmitted(true);
    if (!label.trim() || !isHandleValid || normalizedHandle === null) {
      return;
    }
    const fields = {
      description: description.trim(),
      handle: normalizedHandle,
      label: label.trim(),
      referenceIngredientIds: fileIds,
    };
    const isSaved = element
      ? await onUpdate(element.id, fields)
      : await onCreate({ ...fields, type });
    if (isSaved) {
      onClose();
    }
  };

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
      open
    >
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {element ? translate('edit.title') : translate('create.title')}
          </DialogTitle>
          <DialogDescription>
            {translate('create.description')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {element ? null : (
            <Field label={translate('fields.type')}>
              <fieldset className="flex flex-wrap gap-2">
                {ELEMENT_TYPES.map((option) => (
                  <Button
                    key={option}
                    label={translate(`kinds.${option}`)}
                    onClick={() => setType(option)}
                    size={ButtonSize.SM}
                    variant={
                      type === option
                        ? ButtonVariant.SECONDARY
                        : ButtonVariant.GHOST
                    }
                    withWrapper={false}
                  />
                ))}
              </fieldset>
            </Field>
          )}
          <Field
            error={
              isSubmitted && !label.trim()
                ? translate('errors.missingName')
                : undefined
            }
            label={translate('fields.name')}
          >
            <Input
              onChange={(event) => setLabel(event.target.value)}
              placeholder={translate('fields.namePlaceholder')}
              value={label}
            />
          </Field>
          <Field
            error={
              isSubmitted && !isHandleValid
                ? translate('errors.invalidHandle')
                : undefined
            }
            helpText={translate('fields.handleHelp')}
            label={translate('fields.handle')}
          >
            <Input
              onChange={(event) => setHandle(event.target.value)}
              placeholder={translate('fields.handlePlaceholder')}
              value={handle}
            />
          </Field>
          <Field label={translate('fields.description')}>
            <Textarea
              maxLength={MAX_LIBRARY_ELEMENT_DESCRIPTION_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={translate('fields.descriptionPlaceholder')}
              rows={3}
              value={description}
            />
          </Field>

          <Field
            helpText={
              isFull
                ? translate('files.limit', { max: MAX_CHARACTER_REFERENCES })
                : translate('files.count', {
                    count: fileIds.length,
                    max: MAX_CHARACTER_REFERENCES,
                  })
            }
            label={translate('files.title')}
          >
            <ol className="flex flex-col gap-2">
              {fileIds.map((ingredientId, index) => {
                const position = index + 1;
                return (
                  <li
                    className="flex items-center gap-3 rounded border border-border p-2"
                    key={ingredientId}
                  >
                    <IngredientThumbnail
                      alt={translate('files.imageAlt', {
                        name: label || translate('create.title'),
                        position,
                      })}
                      className="size-10 rounded object-cover outline-media"
                      ingredient={files.get(ingredientId)}
                      size={40}
                    />
                    <span className="text-sm text-muted-foreground">
                      {position}
                    </span>
                    {index === 0 ? (
                      <Badge>{translate('files.cover')}</Badge>
                    ) : null}
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        ariaLabel={translate('files.moveUp', { position })}
                        icon={<ArrowUp className="size-4" />}
                        isDisabled={index === 0}
                        onClick={() => move(index, -1)}
                        size={ButtonSize.ICON}
                        variant={ButtonVariant.GHOST}
                        withWrapper={false}
                      />
                      <Button
                        ariaLabel={translate('files.moveDown', { position })}
                        icon={<ArrowDown className="size-4" />}
                        isDisabled={index === fileIds.length - 1}
                        onClick={() => move(index, 1)}
                        size={ButtonSize.ICON}
                        variant={ButtonVariant.GHOST}
                        withWrapper={false}
                      />
                      <Button
                        ariaLabel={translate('files.remove', { position })}
                        icon={<Trash2 className="size-4" />}
                        onClick={() =>
                          setFileIds((current) =>
                            current.filter((id) => id !== ingredientId),
                          )
                        }
                        size={ButtonSize.ICON}
                        variant={ButtonVariant.GHOST}
                        withWrapper={false}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button
            isDisabled={isFull || isBusy}
            onClick={addFiles}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <ImagePlus /> {translate('files.add')}
          </Button>
          <Button
            isDisabled={isBusy}
            isLoading={isBusy}
            label={element ? translate('edit.save') : translate('create.save')}
            onClick={() => {
              void submit();
            }}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

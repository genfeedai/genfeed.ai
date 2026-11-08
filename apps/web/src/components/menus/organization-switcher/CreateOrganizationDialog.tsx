'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  getOrgSwitchHref,
  ORGANIZATION_DESCRIPTION_MAX_LENGTH,
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_WEBSITE_MAX_LENGTH,
} from '@genfeedai/contracts/constants';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { CreateOrganizationDialogProps } from '@/props/modals/create-organization-dialog.props';

import { useCreateOrganizationModal } from './use-create-organization-modal';

const CREATE_ORGANIZATION_FORM_ID = 'create-organization-form';

/**
 * The "Create Organization" dialog. OrganizationSwitcher loads it on first
 * open, so its form validation (zod) and form primitives stay out of the
 * protected shell's first-load JavaScript.
 */
export default function CreateOrganizationDialog({
  getOrgsService,
  isOpen,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const pathname = usePathname() ?? '/';
  const { push } = useRouter();
  // The API makes the new organization the active one; route into it on the
  // surface the user is on, the same way the switcher does.
  const handleCreated = useCallback(
    (organizationSlug: string) => {
      onOpenChange(false);
      push(getOrgSwitchHref(organizationSlug, pathname));
    },
    [onOpenChange, pathname, push],
  );
  const createModal = useCreateOrganizationModal(
    getOrgsService,
    handleCreated,
  );
  const translateCreate = useTranslations('ui.organizationCreateModal');
  const { reset } = createModal;

  // Reset the form when the dialog is dismissed so a reopen starts clean.
  const handleOpenChange = useCallback(
    (nextIsOpen: boolean) => {
      if (!nextIsOpen) {
        reset();
      }
      onOpenChange(nextIsOpen);
    },
    [onOpenChange, reset],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {/*
          Don't restore focus to the "New Organization" footer button on close —
          Radix's default focus return leaves a blue :focus-visible ring on that
          button (#1227). The brand switcher's "New Brand" overlay renders
          globally and never returns focus to its button, so it has no such ring;
          this mirrors that behavior.
        */}
      <DialogContent
        size="sm"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{translateCreate('title')}</DialogTitle>
          <DialogDescription>
            {translateCreate('description')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Form
            id={CREATE_ORGANIZATION_FORM_ID}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void createModal.submit();
            }}
          >
            <Field
              error={createModal.fieldErrors.label}
              htmlFor="org-switcher-name"
              isRequired
              label={translateCreate('nameLabel')}
            >
              <Input
                type="text"
                value={createModal.values.label}
                onChange={(e) => createModal.setField('label', e.target.value)}
                onBlur={() => createModal.touchField('label')}
                placeholder={translateCreate('namePlaceholder')}
                maxLength={ORGANIZATION_NAME_MAX_LENGTH}
              />
            </Field>
            <Field
              error={createModal.fieldErrors.websiteUrl}
              helpText={translateCreate('websiteHelp')}
              htmlFor="org-switcher-website"
              label={translateCreate('websiteLabel')}
            >
              <Input
                type="text"
                inputMode="url"
                autoComplete="url"
                value={createModal.values.websiteUrl}
                onChange={(e) =>
                  createModal.setField('websiteUrl', e.target.value)
                }
                onBlur={() => createModal.touchField('websiteUrl')}
                placeholder={translateCreate('websitePlaceholder')}
                maxLength={ORGANIZATION_WEBSITE_MAX_LENGTH}
              />
            </Field>
            <Field
              error={createModal.fieldErrors.description}
              helpText={translateCreate('descriptionHelp')}
              htmlFor="org-switcher-description"
              label={translateCreate('descriptionLabel')}
            >
              <Textarea
                value={createModal.values.description}
                onChange={(e) =>
                  createModal.setField('description', e.target.value)
                }
                onBlur={() => createModal.touchField('description')}
                placeholder={translateCreate('descriptionPlaceholder')}
                rows={2}
                className="resize-none"
                maxLength={ORGANIZATION_DESCRIPTION_MAX_LENGTH}
              />
            </Field>
            {createModal.createError && (
              <p role="alert" className="text-sm text-destructive">
                {createModal.createError}
              </p>
            )}
          </Form>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant={ButtonVariant.SECONDARY} withWrapper={false}>
              {translateCreate('cancel')}
            </Button>
          </DialogClose>
          <Button
            type="submit"
            form={CREATE_ORGANIZATION_FORM_ID}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
            isDisabled={createModal.isCreating || !createModal.isValid}
          >
            {createModal.isCreating
              ? translateCreate('creating')
              : translateCreate('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

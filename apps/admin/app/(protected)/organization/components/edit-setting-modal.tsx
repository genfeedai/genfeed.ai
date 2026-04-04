'use client';

import Button from '@components/buttons/base/Button';
import FormControl from '@components/forms/base/form-control/FormControl';
import ModalActions from '@components/modals/actions/ModalActions';
import Modal from '@components/modals/modal/Modal';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import { useCallback, useEffect, useState } from 'react';

interface EditSettingModalProps {
  label: string;
  value: unknown;
  type: 'boolean' | 'number' | 'string' | 'array';
  onSave: (value: unknown) => Promise<void>;
  onCancel: () => void;
}

export function EditSettingModal({
  label,
  value,
  type,
  onSave,
  onCancel,
}: EditSettingModalProps) {
  const [editedValue, setEditedValue] = useState<unknown>(value);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEditedValue(value);
  }, [value]);

  const closeEditModal = useCallback(() => {
    closeModal(ModalEnum.EDIT_SETTING);
    onCancel();
  }, [onCancel]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(editedValue);
      closeEditModal();
    } catch {
      // Errors handled by parent
    } finally {
      setIsSaving(false);
    }
  }, [editedValue, onSave, closeEditModal]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === 'number') {
        setEditedValue(Number(e.target.value));
      } else {
        setEditedValue(e.target.value);
      }
    },
    [type],
  );

  const handleBooleanToggle = useCallback(() => {
    setEditedValue(!editedValue);
  }, [editedValue]);

  function renderSettingInput(): React.ReactNode {
    const inputClassName =
      'flex h-10 w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

    switch (type) {
      case 'boolean':
        return (
          <FormControl label={label}>
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch
                checked={!!editedValue}
                onCheckedChange={handleBooleanToggle}
                disabled={isSaving}
                aria-label={`Toggle ${label}`}
              />
              <span>{editedValue ? 'Enabled' : 'Disabled'}</span>
            </label>
          </FormControl>
        );
      case 'number':
        return (
          <FormControl label={label}>
            <Input
              type="number"
              className={inputClassName}
              value={editedValue as number}
              onChange={handleChange}
              disabled={isSaving}
            />
          </FormControl>
        );
      case 'string':
        return (
          <FormControl label={label}>
            <Input
              type="text"
              className={inputClassName}
              value={editedValue as string}
              onChange={handleChange}
              disabled={isSaving}
            />
          </FormControl>
        );
      case 'array':
        return (
          <FormControl label={label}>
            <div className="text-sm text-foreground/70">
              Array editing not yet implemented. Please use the API directly.
            </div>
          </FormControl>
        );
    }
  }

  return (
    <Modal id={ModalEnum.EDIT_SETTING} title={`Edit ${label}`}>
      <div className="space-y-4">
        {renderSettingInput()}

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={closeEditModal}
            isDisabled={isSaving}
          />
          <Button
            label="Save"
            variant={ButtonVariant.DEFAULT}
            onClick={handleSave}
            isLoading={isSaving}
            isDisabled={isSaving || editedValue === value}
          />
        </ModalActions>
      </div>
    </Modal>
  );
}

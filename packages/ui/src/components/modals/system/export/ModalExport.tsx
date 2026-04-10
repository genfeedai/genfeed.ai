'use client';

import {
  type ExportField,
  type ExportSchema,
  exportSchema,
} from '@genfeedai/client/schemas';
import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ModalExportProps } from '@genfeedai/props/modals/modal.props';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { SelectField } from '@ui/primitives/select';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

const availableFields: { value: string; label: string }[] = [
  { label: 'ID', value: 'id' },
  { label: 'Title', value: 'title' },
  { label: 'Description', value: 'description' },
  { label: 'Status', value: 'status' },
  { label: 'Platform', value: 'platform' },
  { label: 'Scheduled Date', value: 'scheduledDate' },
  { label: 'Post Date', value: 'publicationDate' },
  { label: 'Views', value: 'views' },
  { label: 'Likes', value: 'likes' },
  { label: 'Comments', value: 'comments' },
  { label: 'Tags', value: 'tags' },
  { label: 'Video Label', value: 'videoLabel' },
  { label: 'Video Description', value: 'videoDescription' },
  { label: 'Extension', value: 'extension' },
  { label: 'Model', value: 'model' },
  { label: 'Style', value: 'style' },
  { label: 'Is Repeat', value: 'isRepeat' },
  { label: 'Repeat Frequency', value: 'repeatFrequency' },
  { label: 'Repeat Interval', value: 'repeatInterval' },
  { label: 'Repeat Count', value: 'repeatCount' },
  { label: 'Max Repeats', value: 'maxRepeats' },
  { label: 'Created At', value: 'createdAt' },
  { label: 'Updated At', value: 'updatedAt' },
];

// Default fields for standard CSV export
const defaultFields: ExportField[] = [
  'videoLabel',
  'views',
  'comments',
  'likes',
  'platform',
];

export default function ModalExport({
  onExport,
  isOpen,
  openKey,
}: ModalExportProps) {
  const [selectedFields, setSelectedFields] =
    useState<ExportField[]>(defaultFields);

  const form = useForm<ExportSchema>({
    defaultValues: {
      fields: defaultFields,
      format: 'csv' as const,
    },
    resolver: standardSchemaResolver(exportSchema),
  });

  useModalAutoOpen(ModalEnum.EXPORT, { isOpen, openKey });

  const handleExport = () => {
    const values = form.getValues();
    onExport(values.format, selectedFields);
    closeModal(ModalEnum.EXPORT);
  };

  const toggleField = (field: ExportField) => {
    setSelectedFields((prev) => {
      const newFields = prev.includes(field)
        ? prev.filter((f) => f !== field)
        : [...prev, field];
      form.setValue('fields', newFields, { shouldValidate: true });
      return newFields;
    });
  };

  const selectAll = () => {
    setSelectedFields(availableFields.map((f) => f.value as ExportField));
  };

  const deselectAll = () => {
    setSelectedFields([]);
  };

  return (
    <Modal id={ModalEnum.EXPORT} title="Export Data">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">
            Export Format
          </label>

          <SelectField
            name="format"
            control={form.control}
            onChange={(e) =>
              form.setValue('format', e.target.value as 'csv' | 'xlsx', {
                shouldValidate: true,
              })
            }
            placeholder="Select format"
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (XLSX)</option>
          </SelectField>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">
              Select Fields to Export
            </label>
            <div className="text-xs text-foreground/60">
              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                className="text-primary hover:underline text-xs"
                onClick={selectAll}
                ariaLabel="Select all fields"
              >
                Select All
              </Button>
              {' | '}
              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                className="text-primary hover:underline text-xs"
                onClick={deselectAll}
                ariaLabel="Deselect all fields"
              >
                Deselect All
              </Button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto border border-white/[0.08] p-2">
            <div className="grid grid-cols-2 gap-2">
              {availableFields.map((field) => (
                <div key={field.value} className="hover:bg-background p-1">
                  <Checkbox
                    name={`field-${field.value}`}
                    label={field.label}
                    isChecked={selectedFields.includes(
                      field.value as ExportField,
                    )}
                    onChange={() => toggleField(field.value as ExportField)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-sm text-foreground/60">
          {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''}
          selected
        </div>
      </div>

      <ModalActions>
        <Button
          label="Cancel"
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.LG}
          className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
          onClick={() => closeModal(ModalEnum.EXPORT)}
        />

        <Button
          label={`Export as ${form.watch('format').toUpperCase()}`}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.LG}
          className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
          onClick={handleExport}
          isDisabled={selectedFields.length === 0}
        />
      </ModalActions>
    </Modal>
  );
}

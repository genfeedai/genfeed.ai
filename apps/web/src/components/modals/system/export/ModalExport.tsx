'use client';

import {
  type ExportField,
  type ExportSchema,
  exportSchema,
} from '@genfeedai/client/schemas';
import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import type { ModalExportProps } from '@genfeedai/props/modals/modal.props';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useModalAutoOpen } from '@/hooks/ui/use-modal-auto-open/use-modal-auto-open';

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

const FORMAT_OPTIONS = [
  { Icon: FileText, hintKey: 'csvHint', label: 'CSV', value: 'csv' },
  { Icon: FileSpreadsheet, hintKey: 'xlsxHint', label: 'XLSX', value: 'xlsx' },
] as const;

const ALL_FIELDS = availableFields.map((field) => field.value as ExportField);

export default function ModalExport({
  onExport,
  isOpen,
  openKey,
}: ModalExportProps) {
  const translate = useTranslations('ui.exportModal');
  const [selectedFields, setSelectedFields] =
    useState<ExportField[]>(defaultFields);

  const form = useForm<ExportSchema>({
    defaultValues: {
      fields: defaultFields,
      format: 'csv' as const,
    },
    resolver: standardSchemaResolver(exportSchema),
  });
  const format = form.watch('format');

  useModalAutoOpen(ModalEnum.EXPORT, { isOpen, openKey });

  const handleExport = () => {
    onExport(format, selectedFields);
    closeModal(ModalEnum.EXPORT);
  };

  const updateFields = (fields: ExportField[]) => {
    setSelectedFields(fields);
    form.setValue('fields', fields, { shouldValidate: true });
  };

  const isEverySelected = selectedFields.length === ALL_FIELDS.length;

  return (
    <Modal id={ModalEnum.EXPORT} size="md" title={translate('title')}>
      <div className="flex flex-col gap-5">
        <OptionTileGroup
          ariaLabel={translate('formatLabel')}
          columns={2}
          onValueChange={(value) => {
            if (value === 'csv' || value === 'xlsx') {
              form.setValue('format', value, { shouldValidate: true });
            }
          }}
          value={format}
        >
          {FORMAT_OPTIONS.map(({ Icon, hintKey, label, value }) => (
            <OptionTile
              description={translate(hintKey)}
              icon={
                <span className="flex size-8 items-center justify-center rounded-md bg-background-tertiary text-muted-foreground">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
              }
              key={value}
              title={label}
              value={value}
            />
          ))}
        </OptionTileGroup>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {translate('fieldsCount', {
                selected: selectedFields.length,
                total: ALL_FIELDS.length,
              })}
            </span>
            <Button
              onClick={() => updateFields(isEverySelected ? [] : ALL_FIELDS)}
              size={ButtonSize.XS}
              textTransform="none"
              variant={ButtonVariant.GHOST}
            >
              {isEverySelected ? translate('clearAll') : translate('selectAll')}
            </Button>
          </div>
          <SegmentedControl
            appearance="chip"
            ariaLabel={translate('fieldsLabel')}
            className="max-h-64 overflow-y-auto"
            onValueChange={(fields) => updateFields(fields as ExportField[])}
            options={availableFields}
            size="sm"
            type="multiple"
            value={selectedFields}
          />
        </div>
      </div>

      <ModalActions>
        <Button
          onClick={() => closeModal(ModalEnum.EXPORT)}
          textTransform="none"
          variant={ButtonVariant.GHOST}
        >
          {translate('cancel')}
        </Button>
        <Button
          isDisabled={selectedFields.length === 0}
          onClick={handleExport}
          textTransform="none"
          variant={ButtonVariant.DEFAULT}
        >
          {translate('exportAs', { format: format.toUpperCase() })}
        </Button>
      </ModalActions>
    </Modal>
  );
}

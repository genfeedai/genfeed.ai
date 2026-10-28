'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { WorkflowModelFieldProps } from '@genfeedai/props/workflows/workflow-model-picker.props';
import { Button } from '@ui/primitives/button';
import { Label } from '@ui/primitives/label';
import { ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useId, useState } from 'react';
import { ModelBrowserModal } from '@/components/models/ModelBrowserModal';
import { useWorkflowModelCatalog } from '@/features/workflows/hooks/useWorkflowModelCatalog';

export function WorkflowModelField({
  categories,
  onChange,
  value,
}: WorkflowModelFieldProps) {
  const translate = useTranslations('pages.workflows.actionInspector');
  const catalog = useWorkflowModelCatalog(categories);
  const [isOpen, setIsOpen] = useState(false);
  const labelId = useId();
  const valueId = useId();
  const selected = catalog.models.find((model) => model.key === value);

  const handleSelect = useCallback(
    (model: IModel) => onChange(model.key),
    [onChange],
  );
  const handleClose = useCallback(() => setIsOpen(false), []);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-foreground" id={labelId}>
        {translate('model')}
      </Label>
      <Button
        aria-labelledby={`${labelId} ${valueId}`}
        className="nodrag h-8 w-full justify-between px-3 text-sm font-normal"
        onClick={() => setIsOpen(true)}
        textTransform="none"
        type="button"
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      >
        <span className="truncate" id={valueId}>
          {selected?.label || value || translate('selectModel')}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </Button>
      <ModelBrowserModal
        hasError={catalog.hasError}
        isLoading={catalog.isLoading}
        isOpen={isOpen}
        models={catalog.models}
        onClose={handleClose}
        onSelect={handleSelect}
        selectedKey={value}
      />
    </div>
  );
}

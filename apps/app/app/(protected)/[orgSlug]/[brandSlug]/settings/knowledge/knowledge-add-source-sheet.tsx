'use client';

import {
  ButtonVariant,
  KnowledgeMemoryScope,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { KnowledgeAddSourceSheetProps } from '@props/content/knowledge-library.props';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type CaptureMode = 'text' | 'url' | 'document';

const MODE_OPTIONS: Array<{ labelKey: string; value: CaptureMode }> = [
  { labelKey: 'modeText', value: 'text' },
  { labelKey: 'modeUrl', value: 'url' },
  { labelKey: 'modeDocument', value: 'document' },
];

const KIND_BY_MODE: Record<CaptureMode, KnowledgeSourceKind> = {
  document: KnowledgeSourceKind.DOCUMENT,
  text: KnowledgeSourceKind.TEXT,
  url: KnowledgeSourceKind.URL,
};

/** Keys resolve under `pages.library.knowledge.purpose`. */
export const PURPOSE_OPTIONS: Array<{
  hintKey: string;
  labelKey: string;
  value: KnowledgeSourcePurpose;
}> = [
  {
    hintKey: 'inspirationHint',
    labelKey: 'inspiration',
    value: KnowledgeSourcePurpose.INSPIRATION,
  },
  {
    hintKey: 'brandTruthHint',
    labelKey: 'brandTruth',
    value: KnowledgeSourcePurpose.BRAND_TRUTH,
  },
  {
    hintKey: 'researchHint',
    labelKey: 'research',
    value: KnowledgeSourcePurpose.RESEARCH,
  },
];

export default function KnowledgeAddSourceSheet({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: KnowledgeAddSourceSheetProps) {
  const translate = useTranslations('pages.library.knowledge.add');
  const translatePurpose = useTranslations('pages.library.knowledge.purpose');
  const [mode, setMode] = useState<CaptureMode>('url');
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState<KnowledgeSourcePurpose>(
    KnowledgeSourcePurpose.INSPIRATION,
  );
  const [text, setText] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');

  const isTextMode = mode === 'text';
  const hasContent = isTextMode
    ? text.trim().length > 0
    : referenceUrl.trim().length > 0;
  const isValid = title.trim().length > 0 && hasContent;

  const reset = () => {
    setMode('url');
    setTitle('');
    setPurpose(KnowledgeSourcePurpose.INSPIRATION);
    setText('');
    setReferenceUrl('');
  };

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) {
      return;
    }
    await onSubmit({
      kind: KIND_BY_MODE[mode],
      purpose,
      scope: KnowledgeMemoryScope.BRAND,
      title: title.trim(),
      ...(isTextMode
        ? { text: text.trim() }
        : { referenceUrl: referenceUrl.trim() }),
    });
    reset();
  };

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={isOpen}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{translate('title')}</SheetTitle>
          <SheetDescription>{translate('description')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4">
          <Field label={translate('sourceType')}>
            <Select
              onValueChange={(value) => setMode(value as CaptureMode)}
              value={mode}
            >
              <SelectTrigger aria-label={translate('sourceType')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {translate(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={translate('titleLabel')}>
            <Input
              aria-label={translate('titleLabel')}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={translate('titlePlaceholder')}
              value={title}
            />
          </Field>
          {isTextMode ? (
            <Field label={translate('text')}>
              <Textarea
                aria-label={translate('text')}
                onChange={(event) => setText(event.target.value)}
                placeholder={translate('textPlaceholder')}
                rows={8}
                value={text}
              />
            </Field>
          ) : (
            <Field
              label={translate(mode === 'document' ? 'documentUrl' : 'url')}
            >
              <Input
                aria-label={translate(
                  mode === 'document' ? 'documentUrl' : 'url',
                )}
                onChange={(event) => setReferenceUrl(event.target.value)}
                placeholder={translate('urlPlaceholder')}
                type="url"
                value={referenceUrl}
              />
            </Field>
          )}
          <Field label={translate('purposeLabel')}>
            <Select
              onValueChange={(value) =>
                setPurpose(value as KnowledgeSourcePurpose)
              }
              value={purpose}
            >
              <SelectTrigger aria-label={translate('purposeLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {translatePurpose(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {translatePurpose(
                PURPOSE_OPTIONS.find((option) => option.value === purpose)
                  ?.hintKey ?? 'inspirationHint',
              )}
            </p>
          </Field>
        </div>
        <SheetFooter>
          <Button
            label={translate('cancel')}
            onClick={onClose}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            isDisabled={!isValid}
            isLoading={isSubmitting}
            label={translate('submit')}
            onClick={() => {
              void handleSubmit();
            }}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

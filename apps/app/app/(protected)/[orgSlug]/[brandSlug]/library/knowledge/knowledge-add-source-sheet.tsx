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
import { useState } from 'react';

type CaptureMode = 'text' | 'url' | 'document';

const MODE_OPTIONS: Array<{ label: string; value: CaptureMode }> = [
  { label: 'Paste text', value: 'text' },
  { label: 'Web page URL', value: 'url' },
  { label: 'PDF or document URL', value: 'document' },
];

const KIND_BY_MODE: Record<CaptureMode, KnowledgeSourceKind> = {
  document: KnowledgeSourceKind.DOCUMENT,
  text: KnowledgeSourceKind.TEXT,
  url: KnowledgeSourceKind.URL,
};

export const PURPOSE_OPTIONS: Array<{
  description: string;
  label: string;
  value: KnowledgeSourcePurpose;
}> = [
  {
    description: 'Style and ideas to draw from; never treated as fact.',
    label: 'Inspiration',
    value: KnowledgeSourcePurpose.INSPIRATION,
  },
  {
    description: 'Facts about your brand that generations must respect.',
    label: 'Brand Truth',
    value: KnowledgeSourcePurpose.BRAND_TRUTH,
  },
  {
    description: 'Market and audience material for context.',
    label: 'Research',
    value: KnowledgeSourcePurpose.RESEARCH,
  },
];

export default function KnowledgeAddSourceSheet({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: KnowledgeAddSourceSheetProps) {
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
          <SheetTitle>Add knowledge source</SheetTitle>
          <SheetDescription>
            Genfeed extracts, chunks and embeds the source so generations can
            cite it.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4">
          <Field label="Source type">
            <Select
              onValueChange={(value) => setMode(value as CaptureMode)}
              value={mode}
            >
              <SelectTrigger aria-label="Source type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title">
            <Input
              aria-label="Title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Pricing page"
              value={title}
            />
          </Field>
          {isTextMode ? (
            <Field label="Text">
              <Textarea
                aria-label="Text"
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste the material Genfeed should know"
                rows={8}
                value={text}
              />
            </Field>
          ) : (
            <Field label={mode === 'document' ? 'Document URL' : 'URL'}>
              <Input
                aria-label={mode === 'document' ? 'Document URL' : 'URL'}
                onChange={(event) => setReferenceUrl(event.target.value)}
                placeholder="https://"
                type="url"
                value={referenceUrl}
              />
            </Field>
          )}
          <Field label="Purpose">
            <Select
              onValueChange={(value) =>
                setPurpose(value as KnowledgeSourcePurpose)
              }
              value={purpose}
            >
              <SelectTrigger aria-label="Purpose">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {
                PURPOSE_OPTIONS.find((option) => option.value === purpose)
                  ?.description
              }
            </p>
          </Field>
        </div>
        <SheetFooter>
          <Button
            label="Cancel"
            onClick={onClose}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            isDisabled={!isValid}
            isLoading={isSubmitting}
            label="Add source"
            onClick={() => {
              void handleSubmit();
            }}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

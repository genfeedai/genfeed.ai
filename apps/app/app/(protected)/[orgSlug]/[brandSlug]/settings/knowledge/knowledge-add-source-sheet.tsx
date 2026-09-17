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
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type CaptureMode = 'audio' | 'document' | 'rss' | 'text' | 'url' | 'video';

const MODE_OPTIONS: Array<{ labelKey: string; value: CaptureMode }> = [
  { labelKey: 'modeText', value: 'text' },
  { labelKey: 'modeUrl', value: 'url' },
  { labelKey: 'modeDocument', value: 'document' },
  { labelKey: 'modeRss', value: 'rss' },
  { labelKey: 'modeAudio', value: 'audio' },
  { labelKey: 'modeVideo', value: 'video' },
];

const KIND_BY_MODE: Record<CaptureMode, KnowledgeSourceKind> = {
  audio: KnowledgeSourceKind.AUDIO,
  document: KnowledgeSourceKind.DOCUMENT,
  rss: KnowledgeSourceKind.RSS,
  text: KnowledgeSourceKind.TEXT,
  url: KnowledgeSourceKind.URL,
  video: KnowledgeSourceKind.VIDEO,
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
  const [transcriptUrl, setTranscriptUrl] = useState('');
  const [isTranscriptGenerationAllowed, setIsTranscriptGenerationAllowed] =
    useState(false);

  const isTextMode = mode === 'text';
  const isMediaMode = mode === 'audio' || mode === 'video';
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
    setTranscriptUrl('');
    setIsTranscriptGenerationAllowed(false);
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
      ...(isMediaMode && transcriptUrl.trim()
        ? { transcriptUrl: transcriptUrl.trim() }
        : {}),
      ...(isMediaMode ? { isTranscriptGenerationAllowed } : {}),
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
              label={translate(
                mode === 'document'
                  ? 'documentUrl'
                  : mode === 'rss'
                    ? 'rssUrl'
                    : mode === 'audio'
                      ? 'audioUrl'
                      : mode === 'video'
                        ? 'videoUrl'
                        : 'url',
              )}
            >
              <Input
                aria-label={translate('url')}
                onChange={(event) => setReferenceUrl(event.target.value)}
                placeholder={translate('urlPlaceholder')}
                type="url"
                value={referenceUrl}
              />
            </Field>
          )}
          {isMediaMode ? (
            <>
              <Field label={translate('transcriptUrl')}>
                <Input
                  aria-label={translate('transcriptUrl')}
                  onChange={(event) => setTranscriptUrl(event.target.value)}
                  placeholder={translate('urlPlaceholder')}
                  type="url"
                  value={transcriptUrl}
                />
              </Field>
              <Field label={translate('generateTranscript')}>
                <Switch
                  aria-label={translate('generateTranscript')}
                  checked={isTranscriptGenerationAllowed}
                  onCheckedChange={setIsTranscriptGenerationAllowed}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {translate('generateTranscriptHint')}
                </p>
              </Field>
            </>
          ) : null}
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

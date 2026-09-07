'use client';

import {
  ButtonVariant,
  KnowledgeProcessingState,
  type KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { formatDate } from '@helpers/formatting/date/date.helper';
import type { KnowledgeSourceDetailSheetProps } from '@props/content/knowledge-library.props';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
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
import { useTranslations } from 'next-intl';
import { PURPOSE_OPTIONS } from './knowledge-add-source-sheet';
import KnowledgeStateBadge from './knowledge-state-badge';

const PREVIEW_LENGTH = 1200;

function readText(payload: Record<string, unknown> | null): string | null {
  const text = payload?.text;
  return typeof text === 'string' && text.trim() ? text : null;
}

function readUrl(
  payload: Record<string, unknown> | null,
  provenance: Record<string, unknown> | null,
): string | null {
  const candidate = payload?.referenceUrl ?? provenance?.url;
  return typeof candidate === 'string' && candidate ? candidate : null;
}

export default function KnowledgeSourceDetailSheet({
  isOpen,
  onArchive,
  onClose,
  onMoveToSpace,
  onRetry,
  onUpdate,
  row,
  spaces,
}: KnowledgeSourceDetailSheetProps) {
  const translate = useTranslations('pages.library.knowledge.detail');
  const translatePurpose = useTranslations('pages.library.knowledge.purpose');
  if (!row) {
    return null;
  }
  const { source, spaceIds, version } = row;
  const text = version ? readText(version.payload) : null;
  const url = version ? readUrl(version.payload, version.provenance) : null;
  const isFailed = version?.processingState === KnowledgeProcessingState.FAILED;
  const availableSpaces = spaces.filter(
    (space) => !spaceIds.includes(space.id),
  );

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
          <SheetTitle>{source.title}</SheetTitle>
          <SheetDescription>
            {translate('captured', {
              date: version
                ? formatDate(version.observedAt)
                : translate('neverCaptured'),
              kind: source.kind,
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <KnowledgeStateBadge version={version} />
            {version ? (
              <span className="text-xs text-muted-foreground">
                {translate('version', {
                  state: version.retrievalState,
                  version: version.version,
                })}
              </span>
            ) : null}
          </div>
          {url ? (
            <a
              className="truncate text-sm text-primary underline"
              href={url}
              rel="noreferrer"
              target="_blank"
            >
              {url}
            </a>
          ) : null}
          {text ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-tertiary p-3 text-xs">
              {text.slice(0, PREVIEW_LENGTH)}
              {text.length > PREVIEW_LENGTH ? '…' : ''}
            </pre>
          ) : null}
          <Field label={translate('purpose')}>
            <Select
              onValueChange={(value) => {
                void onUpdate(source, {
                  purpose: value as KnowledgeSourcePurpose,
                });
              }}
              value={source.purpose}
            >
              <SelectTrigger aria-label={translate('purpose')}>
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
          </Field>
          <Field label={translate('usedInGeneration')}>
            <Switch
              aria-label={translate('usedInGeneration')}
              checked={source.isVisible}
              onCheckedChange={(checked) => {
                void onUpdate(source, { isVisible: checked });
              }}
            />
          </Field>
          <Field label={translate('spaces')}>
            <div className="flex flex-wrap gap-2">
              {spaceIds.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {translate('noSpaces')}
                </span>
              ) : (
                spaces
                  .filter((space) => spaceIds.includes(space.id))
                  .map((space) => (
                    <span
                      className="rounded-sm border border-border px-2 py-0.5 text-xs"
                      key={space.id}
                    >
                      {space.isInbox ? translate('inbox') : space.title}
                    </span>
                  ))
              )}
            </div>
            {availableSpaces.length > 0 ? (
              <Select
                onValueChange={(value) => {
                  void onMoveToSpace(source, value);
                }}
                value=""
              >
                <SelectTrigger
                  aria-label={translate('addToSpace')}
                  className="mt-2"
                >
                  <SelectValue placeholder={translate('addToSpace')} />
                </SelectTrigger>
                <SelectContent>
                  {availableSpaces.map((space) => (
                    <SelectItem key={space.id} value={space.id}>
                      {space.isInbox ? translate('inbox') : space.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </Field>
        </div>
        <SheetFooter>
          {isFailed ? (
            <Button
              label={translate('retryIngestion')}
              onClick={() => {
                void onRetry(source);
              }}
              variant={ButtonVariant.SECONDARY}
            />
          ) : null}
          <Button
            label={translate('archive')}
            onClick={() => {
              void onArchive(source);
            }}
            variant={ButtonVariant.DESTRUCTIVE}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

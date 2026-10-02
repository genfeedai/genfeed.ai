'use client';

import type { SkillImportFormProps } from '@props/settings/skills.props';

export type {
  SkillImportFormLabels,
  SkillImportFormProps,
} from '@props/settings/skills.props';

import { Button } from '@ui/primitives/button';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  buildSkillImportInput,
  SkillImportInputError,
  type SkillImportInputErrorCode,
} from './skill-import-input';

export default function SkillImportForm({
  files,
  slug,
  sourceUrl,
  checksum,
  onFilesChange,
  onSlugChange,
  onSourceUrlChange,
  onChecksumChange,
  onImport,
  labels,
  isDisabled,
  isSubmitting,
  scopeKey,
  resetKey,
  error,
}: SkillImportFormProps) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const currentRequest = useRef<AbortController | null>(null);
  const isMounted = useRef(false);
  const [isWorking, setIsWorking] = useState(false);
  const [localError, setLocalError] = useState<
    SkillImportInputErrorCode | 'IMPORT' | null
  >(null);
  const hasExternalBlock = isDisabled || isSubmitting;
  const identity = useMemo(
    () => ({
      files,
      slug,
      sourceUrl,
      checksum,
      isDisabled,
      isSubmitting,
      scopeKey,
      resetKey,
    }),
    [
      files,
      slug,
      sourceUrl,
      checksum,
      isDisabled,
      isSubmitting,
      scopeKey,
      resetKey,
    ],
  );

  useLayoutEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      currentRequest.current?.abort();
      currentRequest.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    currentRequest.current?.abort();
    currentRequest.current = null;
    setIsWorking(false);
    setLocalError(null);
    if (!identity.files.length && fileInput.current)
      fileInput.current.value = '';
  }, [identity]);

  function invalidate(): void {
    currentRequest.current?.abort();
    currentRequest.current = null;
    setIsWorking(false);
    setLocalError(null);
  }
  async function submit(): Promise<void> {
    if (hasExternalBlock || currentRequest.current) return;
    const controller = new AbortController();
    currentRequest.current = controller;
    setIsWorking(true);
    setLocalError(null);
    function isCurrent(): boolean {
      return (
        isMounted.current &&
        currentRequest.current === controller &&
        !controller.signal.aborted
      );
    }
    try {
      const input = await buildSkillImportInput(
        files,
        {
          slug,
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(checksum ? { checksum } : {}),
        },
        controller.signal,
      );
      if (!isCurrent()) return;
      await onImport(input);
      // The parent owns authoritative creation/hydration and success or recovery messaging.
    } catch (failure) {
      if (isCurrent())
        setLocalError(
          failure instanceof SkillImportInputError ? failure.code : 'IMPORT',
        );
    } finally {
      if (isCurrent()) {
        currentRequest.current = null;
        setIsWorking(false);
      }
    }
  }
  const message =
    error ||
    (localError === 'IMPORT'
      ? labels.failed
      : localError
        ? labels.errors[localError]
        : undefined);
  const hasFileError =
    localError !== null &&
    !['SLUG', 'SOURCE_URL', 'CHECKSUM', 'IMPORT'].includes(localError);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <Form
      aria-label={labels.submit}
      aria-busy={isWorking || isSubmitting}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`${id}-files`}>{labels.files}</Label>
        <Input
          id={`${id}-files`}
          inputRef={fileInput}
          type="file"
          accept=".md,.zip"
          multiple
          isDisabled={hasExternalBlock}
          aria-describedby={`${hintId}${message ? ` ${errorId}` : ''}`}
          aria-invalid={hasFileError}
          onChange={(event) => {
            invalidate();
            onFilesChange(Array.from(event.target.files ?? []));
          }}
        />
        <p id={hintId} className="text-sm text-muted-foreground">
          {labels.packageHint} {labels.nestedHint}
        </p>
        {files.length ? (
          <ul aria-label={labels.selectedFiles} className="text-sm">
            {[...new Set(files.map((file) => file.name))].map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-slug`}>{labels.slug}</Label>
        <Input
          id={`${id}-slug`}
          value={slug}
          isDisabled={hasExternalBlock}
          aria-invalid={localError === 'SLUG'}
          aria-describedby={message ? errorId : undefined}
          onChange={(event) => {
            invalidate();
            onSlugChange(event.target.value);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-source`}>{labels.sourceUrl}</Label>
        <Input
          id={`${id}-source`}
          value={sourceUrl}
          isDisabled={hasExternalBlock}
          aria-invalid={localError === 'SOURCE_URL'}
          aria-describedby={message ? errorId : undefined}
          onChange={(event) => {
            invalidate();
            onSourceUrlChange(event.target.value);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-checksum`}>{labels.checksum}</Label>
        <Input
          id={`${id}-checksum`}
          value={checksum}
          isDisabled={hasExternalBlock}
          aria-invalid={localError === 'CHECKSUM'}
          aria-describedby={message ? errorId : undefined}
          onChange={(event) => {
            invalidate();
            onChecksumChange(event.target.value);
          }}
        />
      </div>
      {message ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <Button
        type="submit"
        label={isWorking || isSubmitting ? labels.submitting : labels.submit}
        isDisabled={hasExternalBlock || isWorking}
      />
    </Form>
  );
}

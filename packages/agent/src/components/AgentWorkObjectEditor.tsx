'use client';

import { useAgentWorkObjectGateStore } from '@genfeedai/agent/stores/agent-work-object-gate.store';
import { ButtonVariant } from '@genfeedai/contracts';
import type { AgentWorkObjectActionPayload } from '@genfeedai/contracts/interfaces';
import type { AgentWorkObjectEditorProps } from '@genfeedai/props/ui/agent/agent-work-objects.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { Textarea } from '@ui/primitives/textarea';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export function AgentWorkObjectEditor({
  object,
  threadId,
  isReadOnly = false,
  onAction,
}: AgentWorkObjectEditorProps) {
  const translate = useTranslations('agent.workObjects');
  const { href } = useOrgUrl();
  const [body, setBody] = useState(object.body ?? '');
  const [rows, setRows] = useState(object.rows ?? []);
  const [pending, setPending] = useState<
    AgentWorkObjectActionPayload['action'] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const viewingRef = useRef(false);
  const requestRef = useRef(false);
  const loadedRevisionRef = useRef({
    id: object.id,
    revision: object.revision,
  });
  const dirty =
    body !== (object.body ?? '') ||
    JSON.stringify(rows) !== JSON.stringify(object.rows ?? []);
  useEffect(() => {
    if (!threadId) return;
    useAgentWorkObjectGateStore.getState().setDirty(threadId, object.id, dirty);
    return function cleanup() {
      useAgentWorkObjectGateStore
        .getState()
        .setDirty(threadId, object.id, false);
    };
  }, [threadId, object.id, dirty]);
  const reviewing = object.reviewStatus === 'reviewing';
  const ready =
    object.reviewStatus === 'passed' || object.reviewStatus === 'skipped';

  useEffect(() => {
    if (
      loadedRevisionRef.current.id === object.id &&
      loadedRevisionRef.current.revision === object.revision
    )
      return;
    loadedRevisionRef.current = { id: object.id, revision: object.revision };
    setBody(object.body ?? '');
    setRows(object.rows ?? []);
    setError(null);
    viewingRef.current = false;
  }, [object.id, object.revision, object.body, object.rows]);

  useEffect(() => {
    const element = rootRef.current;
    if (
      !element ||
      object.viewedInSession ||
      isReadOnly ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    let disposed = false;
    const observer = new IntersectionObserver(
      function observe(entries) {
        if (
          !entries.some((entry) => entry.isIntersecting) ||
          viewingRef.current ||
          document.visibilityState === 'hidden'
        )
          return;
        viewingRef.current = true;
        void actionRef.current(object, 'view').catch(function handleError() {
          viewingRef.current = false;
          if (!disposed) setError(translate('viewFailed'));
        });
        observer.disconnect();
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    return function cleanup() {
      disposed = true;
      observer.disconnect();
    };
  }, [object, isReadOnly, translate]);

  async function act(action: AgentWorkObjectActionPayload['action']) {
    if (requestRef.current) return;
    requestRef.current = true;
    setPending(action);
    setError(null);
    try {
      await onAction(
        object,
        action,
        action === 'edit' ? { body, rows } : undefined,
      );
    } catch {
      setError(translate('actionFailed'));
    } finally {
      requestRef.current = false;
      setPending(null);
    }
  }

  return (
    <div
      ref={rootRef}
      className="my-3 min-w-0 space-y-3 rounded-lg border border-border bg-background-secondary p-3"
      data-work-object-viewed={object.viewedInSession}
      data-work-object-id={object.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{object.title}</p>
        <Link
          href={href(object.href)}
          className="text-xs text-primary underline"
        >
          {translate('openLibrary')}
        </Link>
      </div>
      {object.kind === 'table' ? (
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {object.columns?.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {object.columns?.map((column) => (
                    <TableCell key={column.key}>
                      <Input
                        aria-label={translate('cellLabel', {
                          column: column.label,
                          row: rowIndex + 1,
                        })}
                        value={row[column.key] ?? ''}
                        disabled={isReadOnly || reviewing || Boolean(pending)}
                        onChange={function updateCell(event) {
                          const value = event.target.value;
                          setRows((current) =>
                            current.map((item, index) =>
                              index === rowIndex
                                ? { ...item, [column.key]: value }
                                : item,
                            ),
                          );
                        }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Textarea
          aria-label={object.title}
          className="min-h-48 w-full text-sm"
          value={body}
          disabled={isReadOnly || reviewing || Boolean(pending)}
          onChange={function updateBody(event) {
            setBody(event.target.value);
          }}
        />
      )}
      <p role="status" className="text-xs text-muted-foreground">
        {reviewing
          ? translate('reviewing')
          : dirty
            ? translate('unsaved')
            : ready
              ? translate(
                  object.reviewStatus === 'passed' ? 'passed' : 'skipped',
                )
              : object.reviewStatus === 'failed'
                ? translate('failed')
                : translate('saved')}
      </p>
      {error || object.reviewError ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? object.reviewError}
        </p>
      ) : null}
      {!isReadOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <Button
              isDisabled={Boolean(pending) || reviewing}
              onClick={() => void act('edit')}
            >
              {translate('save')}
            </Button>
          ) : null}
          {!object.viewedInSession ? (
            <Button
              variant={ButtonVariant.GHOST}
              isDisabled={Boolean(pending)}
              onClick={() => void act('view')}
            >
              {translate('markViewed')}
            </Button>
          ) : null}
          {reviewing ? (
            <Button
              isDisabled={Boolean(pending)}
              onClick={() => void act('cancel')}
            >
              {translate('stop')}
            </Button>
          ) : (
            <>
              <Button
                isDisabled={
                  !object.viewedInSession || dirty || Boolean(pending)
                }
                onClick={() => void act('review')}
              >
                {translate('review')}
              </Button>
              <Button
                variant={ButtonVariant.GHOST}
                isDisabled={dirty || Boolean(pending)}
                onClick={() => void act('skip')}
              >
                {translate('skip')}
              </Button>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {translate(
              ready && !dirty ? 'confirmationRequired' : 'generateLocked',
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

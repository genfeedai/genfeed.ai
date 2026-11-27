'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
} from '@genfeedai/contracts';
import type {
  IDesktopWorkspace,
  IDesktopWorkspaceState,
} from '@genfeedai/contracts/desktop';
import Card from '@ui/card/Card';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Folder, FolderOpen, FolderPlus, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { readIpcErrorMessage } from '@/lib/desktop/ipc-error';
import { getDesktopBridge } from '@/lib/desktop/runtime';

/**
 * The folder Desktop works in on this computer: open an existing folder or
 * start a project, switch between the ones Desktop remembers, and move where
 * new projects are created. The records live in the Desktop app, per server.
 */
export default function DesktopWorkspaceSettings() {
  const translate = useTranslations('pages.desktopSettings.workspace');
  const format = useFormatter();
  const { brandId, brands, organizationId } = useBrand();
  const [state, setState] = useState<IDesktopWorkspaceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // use-effect-audit: ignore abortable request and desktop bridge subscription
  useEffect(() => {
    const workspace = getDesktopBridge()?.workspace;
    if (!workspace) {
      return;
    }

    const controller = new AbortController();
    workspace
      .getState()
      .then((next) => {
        if (!controller.signal.aborted) {
          setState(next);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(readIpcErrorMessage(cause, translate('errors.loadFailed')));
        }
      });
    const unsubscribe = workspace.onDidChange(setState);

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [translate]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setIsBusy(true);
      setError(null);
      try {
        await action();
      } catch (cause) {
        setError(readIpcErrorMessage(cause, translate('errors.actionFailed')));
      } finally {
        setIsBusy(false);
      }
    },
    [translate],
  );

  const bridge = getDesktopBridge();
  if (!bridge?.workspace || !state) {
    return error ? <Alert variant="destructive">{error}</Alert> : null;
  }
  const { workspace } = bridge;
  const context = {
    brandId: brandId || null,
    organizationId: organizationId || null,
  };
  const active =
    state.workspaces.find((entry) => entry.id === state.activeWorkspaceId) ??
    null;

  function libraryLabel(entry: IDesktopWorkspace): string {
    if (!entry.brandId) {
      return translate('libraryUnpaired');
    }
    const brand = brands.find((candidate) => candidate.id === entry.brandId);
    return brand
      ? translate('library', { brand: brand.label })
      : translate('libraryUnknown');
  }

  function openedAt(entry: IDesktopWorkspace): string {
    return format.dateTime(new Date(entry.lastOpenedAt), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    void run(async () => {
      await workspace.createProject({ ...context, name: trimmed });
      setName('');
      setIsNaming(false);
    });
  }

  return (
    <Card gap={CardGap.LG} padding={CardPadding.LG}>
      <div>
        <h2 className="text-sm font-medium text-foreground/90">
          {translate('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate('description')}
        </p>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {active ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4">
          <div className="flex min-w-0 items-start gap-3">
            <FolderOpen
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{active.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {active.path}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{translate('active')}</Badge>
                <span>{libraryLabel(active)}</span>
              </div>
            </div>
          </div>
          <Button
            icon={<Folder className="size-4" />}
            label={translate('showInFileManager')}
            onClick={() =>
              void run(() => workspace.revealInFileManager(active.id))
            }
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{translate('empty')}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={<FolderOpen className="size-4" />}
          isDisabled={isBusy}
          label={translate('openFolder')}
          onClick={() => {
            setIsNaming(false);
            void run(() => workspace.openFolder(context));
          }}
          size={ButtonSize.SM}
          withWrapper={false}
        />
        <Button
          icon={<FolderPlus className="size-4" />}
          isDisabled={isBusy}
          label={translate('newProject')}
          onClick={() => setIsNaming(true)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      </div>

      {isNaming ? (
        <Form
          className="rounded-lg border border-border p-4 sm:flex-row sm:items-end"
          onSubmit={handleCreate}
        >
          <div className="min-w-0 flex-1">
            <Field
              description={translate('projectNameHelp', {
                home: state.projectsHome,
              })}
              label={translate('projectName')}
            >
              <Input
                autoFocus
                onChange={(event) => setName(event.target.value)}
                placeholder={translate('projectNamePlaceholder')}
                value={name}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              isDisabled={isBusy || name.trim().length === 0}
              label={translate('create')}
              size={ButtonSize.SM}
              type="submit"
              withWrapper={false}
            />
            <Button
              label={translate('cancel')}
              onClick={() => setIsNaming(false)}
              size={ButtonSize.SM}
              type="button"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </div>
        </Form>
      ) : null}

      {state.workspaces.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-label text-muted-foreground">
            {translate('recent')}
          </h3>
          <div className="overflow-hidden rounded-lg border border-border">
            {state.workspaces.map((entry) => (
              <ListRow
                density="compact"
                description={
                  <span className="font-mono text-xs">{entry.path}</span>
                }
                key={entry.id}
                leading={
                  <Folder
                    aria-hidden="true"
                    className="mt-0.5 size-4 text-muted-foreground"
                  />
                }
                meta={
                  <>
                    <span>{openedAt(entry)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{libraryLabel(entry)}</span>
                  </>
                }
                title={entry.name}
                trailing={
                  <div className="flex items-center gap-1">
                    {entry.id === state.activeWorkspaceId ? (
                      <Badge variant="secondary">{translate('active')}</Badge>
                    ) : (
                      <Button
                        ariaLabel={`${translate('open')} ${entry.name}`}
                        isDisabled={isBusy}
                        label={translate('open')}
                        onClick={() =>
                          void run(() => workspace.setActive(entry.id))
                        }
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
                        withWrapper={false}
                      />
                    )}
                    <Button
                      ariaLabel={translate('forget', { name: entry.name })}
                      icon={<Trash2 className="size-4" />}
                      isDisabled={isBusy}
                      onClick={() => void run(() => workspace.remove(entry.id))}
                      size={ButtonSize.ICON}
                      tooltip={translate('forgetHint')}
                      variant={ButtonVariant.GHOST}
                      withWrapper={false}
                    />
                  </div>
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{translate('homeTitle')}</h3>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {state.projectsHome}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate('homeHelp')}
          </p>
        </div>
        <Button
          isDisabled={isBusy}
          label={translate('changeHome')}
          onClick={() => void run(() => workspace.chooseProjectsHome())}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      </div>
    </Card>
  );
}

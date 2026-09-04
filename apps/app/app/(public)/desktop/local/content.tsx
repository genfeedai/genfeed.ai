'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IDesktopBootstrap,
  IDesktopGeneratedContent,
  IDesktopWorkspace,
} from '@genfeedai/contracts/desktop';
import Card from '@ui/card/Card';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { FolderOpen, HardDrive, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import DesktopLocalProviderSettings from '@/components/desktop/DesktopLocalProviderSettings';
import { getDesktopBridge } from '@/lib/desktop/runtime';
import { useDesktopLocalWorkspaceFlag } from '@/lib/desktop/use-desktop-local-workspace-flag';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function LocalDesktopContent() {
  const translate = useTranslations('common.desktop.local');
  const { isEnabled: isLocalWorkspaceEnabled, isReady: isLocalWorkspaceReady } =
    useDesktopLocalWorkspaceFlag();
  const [bootstrap, setBootstrap] = useState<IDesktopBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<IDesktopGeneratedContent | null>(null);

  const loadLocalRuntime = useCallback(
    async (signal?: AbortSignal) => {
      if (!isLocalWorkspaceEnabled) {
        setIsBusy(false);
        return;
      }

      const bridge = getDesktopBridge();
      if (!bridge) {
        setError(translate('errors.desktopOnly'));
        setIsBusy(false);
        return;
      }

      setError(null);
      setIsBusy(true);
      try {
        const nextBootstrap = await bridge.app.enableOfflineMode();
        if (signal?.aborted) return;
        setBootstrap(nextBootstrap);
      } catch (nextError) {
        if (signal?.aborted) return;
        setError(getErrorMessage(nextError, translate('errors.actionFailed')));
      } finally {
        if (!signal?.aborted) setIsBusy(false);
      }
    },
    [isLocalWorkspaceEnabled, translate],
  );

  useEffect(() => {
    if (isLocalWorkspaceReady && !isLocalWorkspaceEnabled) {
      window.location.assign(APP_ROUTES.LOGIN);
      return;
    }

    if (!isLocalWorkspaceEnabled) {
      return;
    }

    const abortController = new AbortController();
    void loadLocalRuntime(abortController.signal);
    return () => abortController.abort();
  }, [isLocalWorkspaceEnabled, isLocalWorkspaceReady, loadLocalRuntime]);

  const refreshBootstrap = async (): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setBootstrap(await bridge.app.getBootstrap());
  };

  const openWorkspace = async (): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    setError(null);
    try {
      await bridge.workspace.openWorkspace();
      await refreshBootstrap();
    } catch (nextError) {
      setError(getErrorMessage(nextError, translate('errors.actionFailed')));
    }
  };

  const selectWorkspace = async (
    workspace: IDesktopWorkspace,
  ): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    await bridge.workspace.selectWorkspace(workspace.id);
    await refreshBootstrap();
  };

  const generate = async (): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge || !prompt.trim()) return;
    setError(null);
    setIsBusy(true);
    try {
      setResult(
        await bridge.cloud.generateContent({
          platform: 'twitter',
          prompt: prompt.trim(),
          publishIntent: 'review',
          type: 'caption',
        }),
      );
    } catch (nextError) {
      setError(getErrorMessage(nextError, translate('errors.actionFailed')));
    } finally {
      setIsBusy(false);
    }
  };

  const handleUseCloud = async (): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    try {
      await bridge.app.switchToCloudMode();
    } catch (nextError) {
      setError(getErrorMessage(nextError, translate('errors.actionFailed')));
    }
  };

  const handleRevealLogs = async (): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    try {
      await bridge.app.revealLogs();
    } catch (nextError) {
      setError(getErrorMessage(nextError, translate('errors.actionFailed')));
    }
  };

  const activeWorkspace =
    bootstrap?.workspaces.find(
      (workspace) => workspace.id === bootstrap.activeWorkspaceId,
    ) ??
    bootstrap?.workspaces[0] ??
    null;

  return (
    <main className="min-h-dvh bg-background px-6 pb-12 pt-16 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground/45">
              <HardDrive aria-hidden="true" className="size-4" />
              {translate('eyebrow')}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-balance">
              {translate('title')}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-foreground/60">
              {translate('description')}
            </p>
          </div>
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            onClick={() => void handleUseCloud()}
          >
            {translate('useCloud')}
          </Button>
        </header>

        {isBusy && !bootstrap && !error ? (
          <div
            className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background-secondary/40"
            role="status"
          >
            <Spinner size={ComponentSize.LG} />
            <p className="text-sm text-muted-foreground">
              {translate('loading')}
            </p>
          </div>
        ) : (
          <>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>{translate('errors.title')}</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{error}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      onClick={() => void loadLocalRuntime()}
                    >
                      <RefreshCw aria-hidden="true" className="size-4" />
                      {translate('errors.retry')}
                    </Button>
                    <Button
                      type="button"
                      size={ButtonSize.SM}
                      variant={ButtonVariant.GHOST}
                      onClick={() => void handleRevealLogs()}
                    >
                      {translate('errors.revealLogs')}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-6">
                <Card bodyClassName="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold">
                        {translate('workspace.title')}
                      </h2>
                      <p className="text-sm text-foreground/55">
                        {activeWorkspace
                          ? activeWorkspace.path
                          : translate('workspace.description')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      isDisabled={isBusy}
                      onClick={() => void openWorkspace()}
                    >
                      <FolderOpen aria-hidden="true" className="size-4" />
                      {activeWorkspace
                        ? translate('workspace.openAnother')
                        : translate('workspace.chooseFolder')}
                    </Button>
                  </div>

                  {bootstrap && bootstrap.workspaces.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {bootstrap.workspaces.map((workspace) => (
                        <Button
                          key={workspace.id}
                          type="button"
                          size={ButtonSize.SM}
                          variant={
                            workspace.id === activeWorkspace?.id
                              ? ButtonVariant.DEFAULT
                              : ButtonVariant.GHOST
                          }
                          onClick={() => void selectWorkspace(workspace)}
                        >
                          {workspace.name}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </Card>

                <Card bodyClassName="space-y-4 p-5">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <Sparkles aria-hidden="true" className="size-4" />
                      {translate('generation.title')}
                    </h2>
                    <p className="text-sm text-foreground/55">
                      {translate('generation.description')}
                    </p>
                  </div>
                  <Textarea
                    aria-label={translate('generation.promptLabel')}
                    className="min-h-32"
                    placeholder={translate('generation.promptPlaceholder')}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant={ButtonVariant.DEFAULT}
                    isDisabled={isBusy || !prompt.trim() || !activeWorkspace}
                    onClick={() => void generate()}
                  >
                    {isBusy
                      ? translate('generation.working')
                      : translate('generation.generate')}
                  </Button>
                  {result ? (
                    <div className="border-t border-border/60 pt-4 text-sm leading-6 whitespace-pre-wrap">
                      {result.content}
                    </div>
                  ) : null}
                </Card>
              </div>

              {bootstrap ? (
                <DesktopLocalProviderSettings variant="card" />
              ) : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

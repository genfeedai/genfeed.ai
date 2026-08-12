'use client';

import type {
  IDesktopBootstrap,
  IDesktopGeneratedContent,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { FolderOpen, HardDrive, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import DesktopLocalProviderSettings from '@/components/desktop/DesktopLocalProviderSettings';
import { getDesktopBridge } from '@/lib/desktop/runtime';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function LocalDesktopContent() {
  const translate = useTranslations('common.desktop.local');
  const [bootstrap, setBootstrap] = useState<IDesktopBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<IDesktopGeneratedContent | null>(null);

  const loadLocalRuntime = useCallback(async () => {
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
      setBootstrap(nextBootstrap);
    } catch (nextError) {
      setError(getErrorMessage(nextError, translate('errors.actionFailed')));
    } finally {
      setIsBusy(false);
    }
  }, [translate]);

  useEffect(() => {
    void loadLocalRuntime();
  }, [loadLocalRuntime]);

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
          type: 'post',
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
    await bridge.app.switchToCloudMode();
  };

  const handleRevealLogs = async (): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    await bridge.app.revealLogs();
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
            <h1 className="text-3xl font-semibold tracking-tight">
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
            <Card className="space-y-4 p-5">
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

            <Card className="space-y-4 p-5">
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
                <div className="rounded-lg border border-border/60 bg-secondary/40 p-4 text-sm leading-6 whitespace-pre-wrap">
                  {result.content}
                </div>
              ) : null}
            </Card>
          </div>

          {bootstrap ? <DesktopLocalProviderSettings variant="card" /> : null}
        </div>
      </div>
    </main>
  );
}

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
import { useCallback, useEffect, useState } from 'react';
import DesktopLocalProviderSettings from '@/components/desktop/DesktopLocalProviderSettings';
import { getDesktopBridge } from '@/lib/desktop/runtime';

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The local workspace could not complete that action.';
}

export default function LocalDesktopContent() {
  const [bootstrap, setBootstrap] = useState<IDesktopBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<IDesktopGeneratedContent | null>(null);

  const loadLocalRuntime = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setError('Local workspaces are available only in Genfeed Desktop.');
      setIsBusy(false);
      return;
    }

    setError(null);
    setIsBusy(true);
    try {
      const nextBootstrap = await bridge.app.enableOfflineMode();
      setBootstrap(nextBootstrap);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsBusy(false);
    }
  }, []);

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
      setError(getErrorMessage(nextError));
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
      setError(getErrorMessage(nextError));
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
              Local mode
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Your work stays on this Mac
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-foreground/60">
              PGlite and local generation run only while local mode is selected.
              Genfeed Cloud, Redis, and a system PostgreSQL install are not
              required.
            </p>
          </div>
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            onClick={() => void handleUseCloud()}
          >
            Use Genfeed Cloud
          </Button>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Local mode needs attention</AlertTitle>
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
                  Retry local mode
                </Button>
                <Button
                  type="button"
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  onClick={() => void handleRevealLogs()}
                >
                  Reveal logs
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
                  <h2 className="text-base font-semibold">Local workspace</h2>
                  <p className="text-sm text-foreground/55">
                    {activeWorkspace
                      ? activeWorkspace.path
                      : 'Choose a folder for drafts, assets, and generated content.'}
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
                  {activeWorkspace ? 'Open another' : 'Choose folder'}
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
                  Generate locally
                </h2>
                <p className="text-sm text-foreground/55">
                  Uses the provider configured on this device.
                </p>
              </div>
              <Textarea
                aria-label="Local generation prompt"
                className="min-h-32"
                placeholder="Draft a launch post for..."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <Button
                type="button"
                variant={ButtonVariant.DEFAULT}
                isDisabled={isBusy || !prompt.trim() || !activeWorkspace}
                onClick={() => void generate()}
              >
                {isBusy ? 'Working…' : 'Generate'}
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

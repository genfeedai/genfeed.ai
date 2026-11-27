'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
} from '@genfeedai/contracts';
import type {
  IDesktopEditingTool,
  IDesktopEditingToolsReadiness,
} from '@genfeedai/contracts/desktop';
import { CopyButton } from '@ui/buttons/CopyButton';
import Card from '@ui/card/Card';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Code } from '@ui/primitives/code';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { readIpcErrorMessage } from '@/lib/desktop/ipc-error';
import { getDesktopBridge } from '@/lib/desktop/runtime';

/**
 * Which of the programs a local edit calls this computer has. Desktop only
 * looks; the install command is shown to copy, never run.
 */
export default function DesktopEditingToolsSettings() {
  const translate = useTranslations('pages.desktopSettings.tools');
  const [readiness, setReadiness] =
    useState<IDesktopEditingToolsReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const check = useCallback(
    async (signal?: AbortSignal) => {
      const bridge = getDesktopBridge();
      if (!bridge) {
        return;
      }
      setIsChecking(true);
      setError(null);
      try {
        const next = await bridge.app.detectEditingTools();
        if (!signal?.aborted) {
          setReadiness(next);
        }
      } catch (cause) {
        if (!signal?.aborted) {
          setError(readIpcErrorMessage(cause, translate('errors.loadFailed')));
        }
      } finally {
        if (!signal?.aborted) {
          setIsChecking(false);
        }
      }
    },
    [translate],
  );

  // use-effect-audit: ignore abortable request
  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [check]);

  function statusBadge(tool: IDesktopEditingTool) {
    if (tool.status === 'found') {
      return <Badge variant="success">{translate('found')}</Badge>;
    }
    if (tool.status === 'too-old') {
      return <Badge variant="warning">{translate('tooOld')}</Badge>;
    }
    return <Badge variant="destructive">{translate('missing')}</Badge>;
  }

  function toolMeta(tool: IDesktopEditingTool): string | null {
    if (tool.status === 'found') {
      return tool.version
        ? translate('version', { version: tool.version })
        : translate('installed');
    }
    if (!tool.minimumVersion) {
      return null;
    }
    return tool.status === 'too-old' && tool.version
      ? translate('tooOldVersion', {
          minimum: tool.minimumVersion,
          version: tool.version,
        })
      : translate('needsVersion', { minimum: tool.minimumVersion });
  }

  const tools = readiness?.tools ?? [];
  const problems = tools.filter((tool) => tool.status !== 'found').length;

  return (
    <Card gap={CardGap.LG} padding={CardPadding.LG}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground/90">
            {translate('title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('description')}
          </p>
        </div>
        <Button
          icon={
            <RefreshCw
              className={`size-4 ${isChecking ? 'animate-spin' : ''}`}
            />
          }
          isDisabled={isChecking}
          label={translate('check')}
          onClick={() => void check()}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {problems > 0 ? (
        <Alert variant="warning">
          {translate('attention', { count: problems })}
        </Alert>
      ) : null}

      {tools.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {tools.map((tool) => (
            <ListRow
              density="compact"
              description={
                tool.status === 'found' ? undefined : (
                  <span className="mt-1 flex items-center gap-1">
                    <Code>{tool.installCommand}</Code>
                    <CopyButton
                      label={translate('copyCommand', { label: tool.label })}
                      value={tool.installCommand}
                    />
                  </span>
                )
              }
              key={tool.key}
              meta={toolMeta(tool)}
              title={tool.label}
              trailing={statusBadge(tool)}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

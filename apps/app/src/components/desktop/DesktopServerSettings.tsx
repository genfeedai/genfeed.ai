'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  DesktopServerKind,
  IDesktopSelfHostedServerConfig,
  IDesktopServerState,
} from '@genfeedai/contracts/desktop';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { getDesktopBridge } from '@/lib/desktop/runtime';

const EMPTY_SELF_HOSTED: IDesktopSelfHostedServerConfig = {
  apiEndpoint: '',
  appEndpoint: '',
  mcpEndpoint: '',
  wsEndpoint: '',
};

function readErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(
    /^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/,
    '',
  );
}

function toPayload(
  config: IDesktopSelfHostedServerConfig,
): IDesktopSelfHostedServerConfig {
  return {
    apiEndpoint: config.apiEndpoint.trim(),
    ...(config.appEndpoint?.trim()
      ? { appEndpoint: config.appEndpoint.trim() }
      : {}),
    ...(config.mcpEndpoint?.trim()
      ? { mcpEndpoint: config.mcpEndpoint.trim() }
      : {}),
    ...(config.wsEndpoint?.trim()
      ? { wsEndpoint: config.wsEndpoint.trim() }
      : {}),
  };
}

/**
 * Genfeed Desktop server switcher: Genfeed Cloud or a self-hosted API. Each
 * server keeps its own sign-in; switching restarts Desktop on that server.
 */
export default function DesktopServerSettings() {
  const translate = useTranslations('common.desktop.server');
  const [state, setState] = useState<IDesktopServerState | null>(null);
  const [kind, setKind] = useState<DesktopServerKind>('cloud');
  const [selfHosted, setSelfHosted] =
    useState<IDesktopSelfHostedServerConfig>(EMPTY_SELF_HOSTED);
  const [status, setStatus] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.server) {
      return;
    }

    const controller = new AbortController();

    bridge.server
      .getState()
      .then((serverState) => {
        if (controller.signal.aborted) {
          return;
        }
        setState(serverState);
        setKind(serverState.active.kind);
        setSelfHosted({ ...EMPTY_SELF_HOSTED, ...serverState.selfHosted });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setStatus(readErrorMessage(error, translate('errors.loadFailed')));
        }
      });

    return () => controller.abort();
  }, [translate]);

  const updateSelfHosted = useCallback(
    (field: keyof IDesktopSelfHostedServerConfig, value: string) => {
      setSelfHosted((current) => ({ ...current, [field]: value }));
      setStatus(null);
    },
    [],
  );

  const handleTest = async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.server) {
      return;
    }

    setIsBusy(true);
    setStatus(null);
    try {
      const result = await bridge.server.validateSelfHosted(
        toPayload(selfHosted),
      );
      setStatus(
        result.isValid && result.profile
          ? translate('status.reachable', {
              mcp: result.profile.mcpEndpoint,
              server: result.profile.apiEndpoint,
            })
          : (result.error ?? translate('errors.validateFailed')),
      );
    } catch (error) {
      setStatus(readErrorMessage(error, translate('errors.validateFailed')));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSwitch = async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.server) {
      return;
    }

    setIsBusy(true);
    setStatus(translate('status.switching'));
    try {
      // Desktop confirms natively, then restarts on the selected server.
      await bridge.server.select(
        kind === 'cloud'
          ? { kind: 'cloud' }
          : { kind: 'self-hosted', selfHosted: toPayload(selfHosted) },
      );
    } catch (error) {
      setStatus(readErrorMessage(error, translate('errors.switchFailed')));
      setIsBusy(false);
    }
  };

  if (!getDesktopBridge()?.server) {
    return null;
  }

  const isSignedIn = (serverId: string | undefined) =>
    Boolean(serverId && state?.signedInServerIds.includes(serverId));
  const activeServerId = state?.active.id;
  const cloudServerId = state?.cloud.id;
  const isSelectionActive =
    kind === state?.active.kind &&
    (kind === 'cloud' ||
      state?.selfHosted?.apiEndpoint === selfHosted.apiEndpoint.trim());

  return (
    <Card bodyClassName="p-5">
      <div className="text-sm font-medium text-foreground/88">
        {translate('title')}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {translate('description')}
      </p>

      {state ? (
        <p className="mt-3 text-xs text-foreground/64">
          {translate('current', { server: state.active.label })}
          {state.isUsingDefault ? ` ${translate('defaultNote')}` : null}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(['cloud', 'self-hosted'] as const).map((option) => (
          <Button
            key={option}
            ariaLabel={translate(`options.${option}.label`)}
            className={cn(
              'rounded border border-border px-3 py-2 text-left text-xs text-foreground/64',
              kind === option && 'border-border bg-hover text-foreground',
            )}
            isDisabled={isBusy}
            onClick={() => {
              setKind(option);
              setStatus(null);
            }}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <span className="block font-medium">
              {translate(`options.${option}.label`)}
            </span>
            <span className="block text-2xs text-foreground/48">
              {option === 'cloud'
                ? isSignedIn(cloudServerId)
                  ? translate('signedIn')
                  : translate('options.cloud.description')
                : translate('options.self-hosted.description')}
            </span>
          </Button>
        ))}
      </div>

      {kind === 'self-hosted' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field
            className="sm:col-span-2"
            helpText={translate('fields.apiHelp')}
            isRequired
            label={translate('fields.api')}
          >
            <Input
              className="h-8 text-xs"
              onChange={(event) =>
                updateSelfHosted('apiEndpoint', event.target.value)
              }
              placeholder={translate('fields.apiPlaceholder')}
              spellCheck={false}
              value={selfHosted.apiEndpoint}
            />
          </Field>
          <Field label={translate('fields.app')}>
            <Input
              className="h-8 text-xs"
              onChange={(event) =>
                updateSelfHosted('appEndpoint', event.target.value)
              }
              placeholder={translate('fields.derived')}
              spellCheck={false}
              value={selfHosted.appEndpoint ?? ''}
            />
          </Field>
          <Field label={translate('fields.mcp')}>
            <Input
              className="h-8 text-xs"
              onChange={(event) =>
                updateSelfHosted('mcpEndpoint', event.target.value)
              }
              placeholder={translate('fields.derived')}
              spellCheck={false}
              value={selfHosted.mcpEndpoint ?? ''}
            />
          </Field>
          <Field className="sm:col-span-2" label={translate('fields.ws')}>
            <Input
              className="h-8 text-xs"
              onChange={(event) =>
                updateSelfHosted('wsEndpoint', event.target.value)
              }
              placeholder={translate('fields.derived')}
              spellCheck={false}
              value={selfHosted.wsEndpoint ?? ''}
            />
          </Field>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {kind === 'self-hosted' ? (
          <Button
            className="rounded border border-border px-2 py-1 text-xs"
            isDisabled={isBusy || !selfHosted.apiEndpoint.trim()}
            onClick={() => void handleTest()}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            {translate('actions.test')}
          </Button>
        ) : null}
        <Button
          className="rounded border border-border px-2 py-1 text-xs"
          isDisabled={
            isBusy ||
            isSelectionActive ||
            (kind === 'self-hosted' && !selfHosted.apiEndpoint.trim())
          }
          onClick={() => void handleSwitch()}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {isSelectionActive
            ? translate('actions.current')
            : translate('actions.switch')}
        </Button>
        {activeServerId && isSignedIn(activeServerId) ? (
          <span className="text-2xs text-foreground/48">
            {translate('signedIn')}
          </span>
        ) : null}
      </div>

      {status ? (
        <p className="mt-2 break-words text-2xs text-foreground/56">{status}</p>
      ) : null}
    </Card>
  );
}

'use client';

import { ButtonSize, ButtonVariant, CardPadding } from '@genfeedai/contracts';
import type {
  DesktopServerKind,
  IDesktopSelfHostedServerConfig,
  IDesktopServerState,
} from '@genfeedai/contracts/desktop';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { readIpcErrorMessage } from '@/lib/desktop/ipc-error';
import { getDesktopBridge } from '@/lib/desktop/runtime';

const EMPTY_SELF_HOSTED: IDesktopSelfHostedServerConfig = {
  apiEndpoint: '',
  appEndpoint: '',
  mcpEndpoint: '',
  wsEndpoint: '',
};

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

  // use-effect-audit: ignore abortable request
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
          setStatus(readIpcErrorMessage(error, translate('errors.loadFailed')));
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
      setStatus(readIpcErrorMessage(error, translate('errors.validateFailed')));
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
      setStatus(readIpcErrorMessage(error, translate('errors.switchFailed')));
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
    <Card padding={CardPadding.LG}>
      <div className="text-sm font-medium text-foreground/90">
        {translate('title')}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {translate('description')}
      </p>

      {state ? (
        <p className="mt-3 text-xs text-foreground/70">
          {translate('current', { server: state.active.label })}
          {state.isUsingDefault ? ` ${translate('defaultNote')}` : null}
        </p>
      ) : null}

      <OptionTileGroup
        ariaLabel={translate('title')}
        className="mt-4"
        columns={2}
        isDisabled={isBusy}
        onValueChange={(option) => {
          setKind(option);
          setStatus(null);
        }}
        value={kind}
      >
        {(['cloud', 'self-hosted'] as const).map((option) => (
          <OptionTile
            ariaLabel={translate(`options.${option}.label`)}
            description={
              option === 'cloud'
                ? isSignedIn(cloudServerId)
                  ? translate('signedIn')
                  : translate('options.cloud.description')
                : translate('options.self-hosted.description')
            }
            key={option}
            layout="stack"
            title={translate(`options.${option}.label`)}
            value={option}
          />
        ))}
      </OptionTileGroup>

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
            isDisabled={isBusy || !selfHosted.apiEndpoint.trim()}
            onClick={() => void handleTest()}
            size={ButtonSize.XS}
            type="button"
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            {translate('actions.test')}
          </Button>
        ) : null}
        <Button
          isDisabled={
            isBusy ||
            isSelectionActive ||
            (kind === 'self-hosted' && !selfHosted.apiEndpoint.trim())
          }
          onClick={() => void handleSwitch()}
          size={ButtonSize.XS}
          type="button"
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {isSelectionActive
            ? translate('actions.current')
            : translate('actions.switch')}
        </Button>
        {activeServerId && isSignedIn(activeServerId) ? (
          <span className="text-2xs text-muted-foreground">
            {translate('signedIn')}
          </span>
        ) : null}
      </div>

      {status ? (
        <p className="mt-2 break-words text-2xs text-foreground/60">{status}</p>
      ) : null}
    </Card>
  );
}

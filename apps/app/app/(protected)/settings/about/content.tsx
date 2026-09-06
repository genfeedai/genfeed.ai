'use client';

import { BUILD_METADATA } from '@app-config/build-metadata.config';
import { getClientSurface, getDeployment } from '@genfeedai/config/deployment';
import type { ReleaseUpdateState } from '@genfeedai/contracts/interfaces/system/app-build.interface';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { apiClient } from '@/lib/api/client';
import { getDesktopBridge } from '@/lib/desktop/runtime';
import { isNewerRelease, parseLatestRelease } from './release-update';

const subscribeToClientSurface = () => () => {};

export default function AboutContent() {
  const translate = useTranslations('pages.about');
  const deployment = getDeployment();
  const surface = useSyncExternalStore(
    subscribeToClientSurface,
    getClientSurface,
    () => 'web',
  );
  const { version, releaseTag, commitSha, channel } = BUILD_METADATA;
  const shortSha = commitSha.slice(0, 7);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );
  const [update, setUpdate] = useState<ReleaseUpdateState>({ status: 'idle' });
  const updateRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (surface === 'desktop') {
      getDesktopBridge()
        ?.app.getDiagnostics()
        .then((diagnostics) => {
          if (!controller.signal.aborted)
            setDesktopVersion(diagnostics.version);
        })
        .catch(() => {
          // Diagnostics are optional; the build identity remains available offline.
        });
    }
    return () => {
      controller.abort();
      updateRequest.current?.abort();
    };
  }, [surface]);

  async function copyBuild() {
    const line = [
      releaseTag ?? translate('unreleased'),
      shortSha,
      deployment,
      surface,
      translate('copyVersion', { version }),
      translate('copyChannel', { channel }),
      ...(desktopVersion
        ? [translate('copyDesktop', { version: desktopVersion })]
        : []),
    ].join(' · ');
    try {
      await navigator.clipboard.writeText(line);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  async function checkUpdates() {
    updateRequest.current?.abort();
    const controller = new AbortController();
    updateRequest.current = controller;
    setUpdate({ status: 'loading' });
    try {
      const release = parseLatestRelease(
        await apiClient.get<unknown>('/system/latest-release', {
          signal: controller.signal,
        }),
      );
      if (!controller.signal.aborted) {
        setUpdate(
          isNewerRelease(release.version, version)
            ? { status: 'available', tag: release.tag, url: release.url }
            : { status: 'current' },
        );
      }
    } catch {
      if (!controller.signal.aborted) setUpdate({ status: 'error' });
    }
  }

  return (
    <Card bodyClassName="space-y-6">
      <div>
        <h1 id="about-title" className="text-xl font-semibold">
          {translate('title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate('description')}
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{translate('version')}</dt>
          <dd className="font-medium">{version}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{translate('channel')}</dt>
          <dd className="font-medium">{channel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{translate('release')}</dt>
          <dd className="font-medium">
            {releaseTag ? (
              <Link
                href={`https://github.com/genfeedai/genfeed.ai/releases/tag/${encodeURIComponent(releaseTag)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {releaseTag}
              </Link>
            ) : (
              translate('unreleased')
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{translate('commit')}</dt>
          <dd className="font-mono">{shortSha}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{translate('deployment')}</dt>
          <dd>{deployment}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{translate('client')}</dt>
          <dd>{surface}</dd>
        </div>
        {surface === 'desktop' && (
          <div>
            <dt className="text-muted-foreground">
              {translate('desktopVersion')}
            </dt>
            <dd>{desktopVersion ?? translate('unavailable')}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            void copyBuild();
          }}
        >
          {translate('copyBuild')}
        </Button>
        <Link href="https://genfeed.ai/changelog" className="text-sm underline">
          {translate('changelog')}
        </Link>
        {deployment === 'self-hosted' && (
          <Button
            isDisabled={update.status === 'loading'}
            onClick={() => {
              void checkUpdates();
            }}
          >
            {update.status === 'loading'
              ? translate('checking')
              : translate('checkUpdates')}
          </Button>
        )}
      </div>
      <div
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {copyState === 'copied' && <p>{translate('copied')}</p>}
        {copyState === 'error' && <p>{translate('copyError')}</p>}
        {update.status === 'current' && <p>{translate('current')}</p>}
        {update.status === 'error' && <p>{translate('updateError')}</p>}
        {update.status === 'available' && (
          <Link
            href={update.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {translate('available', { tag: update.tag })}
          </Link>
        )}
      </div>
    </Card>
  );
}

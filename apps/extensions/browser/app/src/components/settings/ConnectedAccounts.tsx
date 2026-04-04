import { type ReactElement, useEffect, useState } from 'react';

import { useBrandStore } from '~store/use-brand-store';
import { logger } from '~utils/logger.util';

interface Credential {
  id: string;
  platform: string;
  externalHandle?: string;
  isConnected: boolean;
}

const PLATFORMS = [
  {
    connectEndpoint: '/services/twitter/connect',
    key: 'twitter',
    label: 'Twitter/X',
  },
  {
    connectEndpoint: '/services/instagram/connect',
    key: 'instagram',
    label: 'Instagram',
  },
  {
    connectEndpoint: '/services/linkedin/connect',
    key: 'linkedin',
    label: 'LinkedIn',
  },
  {
    connectEndpoint: '/services/facebook/connect',
    key: 'facebook',
    label: 'Facebook',
  },
  {
    connectEndpoint: '/services/tiktok/connect',
    key: 'tiktok',
    label: 'TikTok',
  },
  {
    connectEndpoint: '/services/youtube/connect',
    key: 'youtube',
    label: 'YouTube',
  },
];

export function ConnectedAccounts(): ReactElement {
  const activeBrandId = useBrandStore((s) => s.activeBrandId);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBrandId) {
      setCredentials([]);
      return;
    }

    chrome.runtime.sendMessage(
      { event: 'getCredentials', payload: { brandId: activeBrandId } },
      (response) => {
        if (response?.success && response.credentials) {
          setCredentials(response.credentials);
        }
      },
    );
  }, [activeBrandId]);

  function handleConnect(platform: string, connectEndpoint: string) {
    if (!activeBrandId) {
      return;
    }

    setConnecting(platform);
    chrome.runtime.sendMessage(
      {
        event: 'startOAuth',
        payload: {
          brandId: activeBrandId,
          connectEndpoint,
          platform,
        },
      },
      (response) => {
        setConnecting(null);
        if (response?.success) {
          // Refresh credentials
          chrome.runtime.sendMessage(
            { event: 'getCredentials', payload: { brandId: activeBrandId } },
            (res) => {
              if (res?.success && res.credentials) {
                setCredentials(res.credentials);
              }
            },
          );
        } else {
          logger.error('OAuth connection failed', response?.error);
        }
      },
    );
  }

  if (!activeBrandId) {
    return (
      <p className="text-xs text-muted-foreground">
        Select a brand to manage connected accounts.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {PLATFORMS.map(({ key, label, connectEndpoint }) => {
        const credential = credentials.find((c) => c.platform === key);
        const isConnected = credential?.isConnected;

        return (
          <div
            key={key}
            className="flex items-center justify-between rounded border border-border px-3 py-2"
          >
            <div>
              <span className="text-sm text-foreground">{label}</span>
              {isConnected && credential?.externalHandle && (
                <span className="ml-2 text-xs text-muted-foreground">
                  @{credential.externalHandle}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleConnect(key, connectEndpoint)}
              disabled={connecting === key}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                isConnected
                  ? 'bg-secondary text-secondary-foreground hover:bg-accent'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              } disabled:opacity-50`}
            >
              {connecting === key
                ? 'Connecting...'
                : isConnected
                  ? 'Reconnect'
                  : 'Connect'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

import '@testing-library/jest-dom/vitest';
import type { IDesktopEditingToolsReadiness } from '@genfeedai/contracts/desktop';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopEditingToolsSettings from './DesktopEditingToolsSettings';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('pages.desktopSettings.tools');

  return { useTranslations: () => translate };
});

const mocks = vi.hoisted(() => ({
  bridge: null as null | {
    app: { detectEditingTools: ReturnType<typeof vi.fn> };
  },
}));

vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: () => mocks.bridge,
}));

const READINESS: IDesktopEditingToolsReadiness = {
  tools: [
    {
      installCommand: 'brew install ffmpeg',
      key: 'ffmpeg',
      label: 'ffmpeg',
      minimumVersion: '5.0',
      path: '/usr/bin/ffmpeg',
      status: 'too-old',
      version: '4.4.2',
    },
    {
      installCommand: 'brew install bun',
      key: 'bun',
      label: 'Bun',
      minimumVersion: '1.1',
      path: null,
      status: 'missing',
      version: null,
    },
    {
      installCommand: 'brew install python',
      key: 'python',
      label: 'Python 3',
      minimumVersion: null,
      path: '/usr/bin/python3',
      status: 'found',
      version: '3.12.1',
    },
  ],
};

describe('DesktopEditingToolsSettings', () => {
  beforeEach(() => {
    mocks.bridge = null;
  });

  it('lists each tool with its state and the command that installs a missing one', async () => {
    mocks.bridge = {
      app: { detectEditingTools: vi.fn().mockResolvedValue(READINESS) },
    };
    render(<DesktopEditingToolsSettings />);

    expect(
      await screen.findByText('Version 4.4.2, needs 5.0 or newer'),
    ).toBeVisible();
    expect(screen.getByText('Needs 1.1 or newer')).toBeVisible();
    expect(screen.getByText('Version 3.12.1')).toBeVisible();
    expect(screen.getByText('Too old')).toBeVisible();
    expect(screen.getByText('Missing')).toBeVisible();
    expect(screen.getByText('Found')).toBeVisible();
    expect(screen.getByText('brew install bun')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Copy install command for Bun' }),
    ).toBeVisible();
  });

  it('says how many tools need attention', async () => {
    mocks.bridge = {
      app: { detectEditingTools: vi.fn().mockResolvedValue(READINESS) },
    };
    render(<DesktopEditingToolsSettings />);

    expect(
      await screen.findByText(
        '2 tools need attention. A skill that needs one stops before it starts and names it.',
      ),
    ).toBeVisible();
  });

  it('looks again when asked', async () => {
    const detectEditingTools = vi.fn().mockResolvedValue(READINESS);
    mocks.bridge = { app: { detectEditingTools } };
    render(<DesktopEditingToolsSettings />);
    await screen.findByText('Missing');

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));

    await waitFor(() => expect(detectEditingTools).toHaveBeenCalledTimes(2));
  });

  it('reports a failed check', async () => {
    mocks.bridge = {
      app: {
        detectEditingTools: vi.fn().mockRejectedValue(new Error('boom')),
      },
    };
    render(<DesktopEditingToolsSettings />);

    expect(await screen.findByText('boom')).toBeVisible();
  });
});

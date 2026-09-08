import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsHelpPage from './content';

const mocks = vi.hoisted(() => ({
  selfHosted: false,
  documentation: 'https://docs.genfeed.ai',
  selfHostedSupport: undefined as string | undefined,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isSelfHostedDeployment: () => mocks.selfHosted,
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    help: {
      get documentation() {
        return mocks.documentation;
      },
      gettingStarted: 'https://docs.genfeed.ai/getting-started',
      selfHostedGettingStarted:
        'https://docs.genfeed.ai/guides/self-host-quickstart',
      workflows: 'https://docs.genfeed.ai/cloud/studio',
      faq: 'https://docs.genfeed.ai/faq',
      changelog: 'https://genfeed.ai/changelog',
      community: 'https://discord.gg/Qy867n83Z4',
      cloudSupport: 'https://genfeed.ai/contact',
      get selfHostedSupport() {
        return mocks.selfHostedSupport;
      },
    },
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

beforeEach(() => {
  mocks.selfHosted = false;
  mocks.documentation = 'https://docs.genfeed.ai';
  mocks.selfHostedSupport = undefined;
});

describe('Help navigation', () => {
  it('shows all learning and support groups without workspace bootstrap', () => {
    render(<SettingsHelpPage />);
    for (const name of [
      'Getting started',
      'Documentation',
      'Workflow learning',
      'Changelog',
      'Frequently asked questions',
      'Community',
      'Support',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeDefined();
    }
    expect(
      screen.getByRole('heading', { name: 'Your first workflow' }),
    ).toBeDefined();
  });

  it('keeps About internal and identifies safe external links', () => {
    render(<SettingsHelpPage />);
    const about = screen.getByRole('link', { name: 'About Genfeed' });
    expect(about.getAttribute('href')).toBe('/settings/about');
    expect(about.getAttribute('target')).toBeNull();
    const changelog = screen.getByRole('link', { name: /^Changelog/ });
    expect(changelog.getAttribute('href')).toBe('https://genfeed.ai/changelog');
    expect(changelog.getAttribute('target')).toBe('_blank');
    expect(changelog.getAttribute('rel')).toBe('noopener noreferrer');
    expect(changelog.textContent).toContain('Opens in a new tab');
  });

  it('shows Cloud support and a Cloud starting guide', () => {
    render(<SettingsHelpPage />);
    expect(
      screen.getByRole('link', { name: /^Support/ }).getAttribute('href'),
    ).toBe('https://genfeed.ai/contact');
    expect(
      screen
        .getByRole('link', { name: /^Getting started/ })
        .getAttribute('href'),
    ).toBe('https://docs.genfeed.ai/getting-started');
  });

  it('gives self-hosted users an operator fallback without a broken support link', () => {
    mocks.selfHosted = true;
    render(<SettingsHelpPage />);
    expect(screen.queryByRole('link', { name: /^Support/ })).toBeNull();
    expect(
      screen.getByText(
        /Your installation has not configured a support destination/,
      ),
    ).toBeDefined();
    expect(
      screen
        .getByRole('link', { name: /^Getting started/ })
        .getAttribute('href'),
    ).toBe('https://docs.genfeed.ai/guides/self-host-quickstart');
  });

  it('uses a configured self-hosted support destination', () => {
    mocks.selfHosted = true;
    mocks.selfHostedSupport = 'https://company.example/support';
    render(<SettingsHelpPage />);
    expect(
      screen.getByRole('link', { name: /^Support/ }).getAttribute('href'),
    ).toBe(mocks.selfHostedSupport);
  });

  it('keeps unavailable documentation readable and removes unsafe navigation', () => {
    mocks.documentation = 'javascript:alert(1)';
    render(<SettingsHelpPage />);
    expect(
      screen.getByRole('heading', { name: 'Documentation' }),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: /^Documentation/ })).toBeNull();
    expect(screen.getByText(/Destination unavailable/)).toBeDefined();
  });

  it('explains character saving and explicit prompt reuse through accessible controls', () => {
    render(<SettingsHelpPage />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Can I save an image I already generated?',
      }),
    );
    expect(screen.getByText(/choose Save as character/)).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'How do I reuse a saved character in a prompt?',
      }),
    );
    expect(
      screen.getByText(
        /does not automatically save it as a reusable character/,
      ),
    ).toBeDefined();
  });
});

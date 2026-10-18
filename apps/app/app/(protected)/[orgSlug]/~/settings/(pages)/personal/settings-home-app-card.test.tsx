// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createContext, type ReactNode, use } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsHomeAppCard from './settings-home-app-card';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

const state = vi.hoisted(() => ({
  apps: [
    { id: 'workspace', label: 'workspace.label' },
    { id: 'agent', label: 'agent.label' },
    { id: 'library', label: 'library.label' },
  ],
  homeAppId: null as string | null,
  isLoaded: true,
  isReady: true,
  organizationHomeAppId: null as string | null,
  setHomeAppId: vi.fn(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    settings: { defaultHomeAppId: state.organizationHomeAppId },
  }),
}));
vi.mock('@/components/shell/rail-preferences.provider', () => ({
  useRailPreferencesContext: () => ({
    homeAppId: state.homeAppId,
    isLoaded: state.isLoaded,
    setHomeAppId: state.setHomeAppId,
  }),
}));
vi.mock('@/components/shell/use-available-rail-apps', () => ({
  useAvailableRailApps: () => ({ apps: state.apps, isReady: state.isReady }),
}));

// Radix Select needs pointer APIs jsdom lacks; a context-backed stand-in keeps
// the value and change handler real.
vi.mock('@ui/primitives/select', () => {
  const SelectContext = createContext<(value: string) => void>(() => {});
  return {
    Select: ({
      children,
      onValueChange,
      value,
      disabled,
    }: {
      children?: ReactNode;
      disabled?: boolean;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => (
      <SelectContext value={onValueChange ?? (() => {})}>
        <div
          data-disabled={disabled ? 'true' : undefined}
          data-testid="select"
          data-value={value}
        >
          {children}
        </div>
      </SelectContext>
    ),
    SelectContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
    SelectItem: ({
      children,
      value,
    }: {
      children?: ReactNode;
      value: string;
    }) => {
      const change = use(SelectContext);
      return (
        <button onClick={() => change(value)} type="button">
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
    SelectValue: () => null,
  };
});

describe('SettingsHomeAppCard', () => {
  beforeEach(() => {
    state.homeAppId = null;
    state.isLoaded = true;
    state.isReady = true;
    state.organizationHomeAppId = null;
    state.setHomeAppId.mockReset();
  });

  it('shows what Default lands on, following the organization', () => {
    state.organizationHomeAppId = 'agent';
    render(<SettingsHomeAppCard />);

    expect(screen.getByText('Default (Agent)')).toBeInTheDocument();
    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-value',
      'default',
    );
  });

  it('falls back to Workspace as the default', () => {
    render(<SettingsHomeAppCard />);

    expect(screen.getByText('Default (Workspace)')).toBeInTheDocument();
  });

  it('saves the picked app, and clears it with Default', () => {
    state.homeAppId = 'library';
    render(<SettingsHomeAppCard />);

    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-value',
      'library',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));
    expect(state.setHomeAppId).toHaveBeenCalledWith('agent');
    fireEvent.click(
      screen.getByRole('button', { name: 'Default (Workspace)' }),
    );
    expect(state.setHomeAppId).toHaveBeenLastCalledWith(null);
  });

  it('keeps the picker disabled until the available apps are ready', () => {
    state.isReady = false;
    render(<SettingsHomeAppCard />);

    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-disabled',
      'true',
    );
  });

  it('treats a saved app the member cannot open as Default', () => {
    state.homeAppId = 'turbo';
    render(<SettingsHomeAppCard />);

    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-value',
      'default',
    );
  });
});

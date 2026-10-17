// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { AppRailNavigationItem } from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import { APP_RAIL_REGISTRY } from '@ui/shell/app-rail/app-rail.registry';
import { createContext, type ReactNode, use } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppRailCustomize } from './AppRailCustomize';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

// Radix Select needs pointer APIs jsdom lacks; a context-backed stand-in keeps
// the value and change handler real.
vi.mock('@ui/primitives/select', () => {
  const SelectContext = createContext<(value: string) => void>(() => {});
  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children?: ReactNode;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => (
      <SelectContext value={onValueChange ?? (() => {})}>
        <div data-testid="select" data-value={value}>
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

function item(appId: string, label: string): AppRailNavigationItem {
  const app = APP_RAIL_REGISTRY.find((candidate) => candidate.id === appId);
  if (!app) throw new Error(`unknown rail app ${appId}`);
  return {
    app,
    description: label,
    href: `/acme/${appId}`,
    isLocked: false,
    label,
  };
}

const ITEMS = [item('workspace', 'Workspace'), item('agent', 'Agent')];

function renderDialog(
  props: Partial<Parameters<typeof AppRailCustomize>[0]> = {},
) {
  return render(
    <AppRailCustomize
      isOpen
      items={ITEMS}
      onOpenChange={vi.fn()}
      onReorder={vi.fn()}
      onReset={vi.fn()}
      {...props}
    />,
  );
}

describe('AppRailCustomize home picker', () => {
  it('offers no home picker without a handler', () => {
    renderDialog();
    expect(screen.queryByTestId('app-rail-home')).not.toBeInTheDocument();
  });

  it('shows the default and every app the member can open', () => {
    renderDialog({
      defaultHomeLabel: 'Agent',
      homeOptions: ITEMS,
      onHomeAppChange: vi.fn(),
    });

    expect(screen.getByTestId('app-rail-home')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Default (Agent)' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Workspace' })).toBeVisible();
    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-value',
      'default',
    );
  });

  it('reflects the member’s own choice', () => {
    renderDialog({
      homeAppId: 'agent',
      homeOptions: ITEMS,
      onHomeAppChange: vi.fn(),
    });
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'agent');
  });

  it('falls back to the default when the chosen app is no longer available', () => {
    renderDialog({
      homeAppId: 'turbo',
      homeOptions: ITEMS,
      onHomeAppChange: vi.fn(),
    });
    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-value',
      'default',
    );
  });

  it('saves a chosen app, and clears the choice back to the default', () => {
    const onHomeAppChange = vi.fn();
    renderDialog({
      defaultHomeLabel: 'Workspace',
      homeAppId: 'agent',
      homeOptions: ITEMS,
      onHomeAppChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
    expect(onHomeAppChange).toHaveBeenLastCalledWith('workspace');

    fireEvent.click(
      screen.getByRole('button', { name: 'Default (Workspace)' }),
    );
    expect(onHomeAppChange).toHaveBeenLastCalledWith(null);
  });
});

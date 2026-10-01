import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  identity: { orgId: 'org', userId: 'user', sessionId: 'session' },
  brand: { id: 'brand' },
  catalog: {
    isAvailable: true,
    defaultModelKey: 'model',
    models: [
      {
        key: 'model',
        label: 'Model',
        isAvailable: true,
        inspectionCapability: 'unknown',
      },
    ],
  },
  quote: vi.fn(),
  submit: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.identity,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: mocks.brand }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));
vi.mock('@ui/primitives/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));
vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock('@hooks/data/content/use-visual-projects', () => ({
  useVisualProjects: () => ({
    library: { data: [] },
    catalog: {
      data: mocks.catalog,
    },
    projects: { data: { pages: [] } },
    project: {},
    quote: mocks.quote,
    submit: mocks.submit,
  }),
}));

import MotionContent from './content';

const quote = {
  modelKey: 'model',
  isByok: false,
  authoringCredits: 1,
  inspectionCredits: 1,
  renderCredits: 1,
  maximumCredits: 3,
  settings: { width: 640, height: 360 },
  outputRequests: [{ format: 'mp4' }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity = { orgId: 'org', userId: 'user', sessionId: 'session' };
  mocks.catalog = {
    isAvailable: true,
    defaultModelKey: 'model',
    models: [
      {
        key: 'model',
        label: 'Model',
        isAvailable: true,
        inspectionCapability: 'unknown',
      },
    ],
  };
  mocks.quote.mockResolvedValue(quote);
  mocks.submit.mockResolvedValue({ id: 'project' });
});
describe('Motion quote review', () => {
  it('requires explicit cost acknowledgment before submission and clears it when input changes', async () => {
    render(<MotionContent />);
    fireEvent.change(screen.getByLabelText('label'), {
      target: { value: 'Visual' },
    });
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    await screen.findByRole('button', { name: 'confirm' });
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('acknowledge'));
    expect(screen.getByRole('button', { name: 'confirm' })).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Different title' },
    });
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('discards an in-flight quote when the input changes', async () => {
    let resolve: (value: typeof quote) => void = () => {};
    mocks.quote.mockImplementationOnce(
      () =>
        new Promise((accept) => {
          resolve = accept;
        }),
    );
    render(<MotionContent />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'First' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Second' },
    });
    await act(async () => resolve(quote));
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
  });
  it('clears prior actor source, props and review on authentication scope change', async () => {
    const view = render(<MotionContent />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Private source instruction' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    await screen.findByRole('button', { name: 'confirm' });
    mocks.identity = { orgId: 'other', userId: 'other', sessionId: 'new' };
    view.rerender(<MotionContent />);
    await waitFor(() =>
      expect(screen.getByLabelText('prompt')).toHaveValue(''),
    );
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
  });
  it('renders when the catalog payload omits models', () => {
    Reflect.deleteProperty(mocks.catalog, 'models');
    expect(() => render(<MotionContent />)).not.toThrow();
    expect(screen.getByRole('heading', { name: 'title' })).toBeVisible();
  });
});

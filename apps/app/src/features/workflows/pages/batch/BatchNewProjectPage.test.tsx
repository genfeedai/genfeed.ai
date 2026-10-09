import '@testing-library/jest-dom/vitest';
import { BatchProjectKind } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchNewProjectPage from './BatchNewProjectPage';

const mocks = vi.hoisted(() => ({
  isIdeasEnabled: true,
  brandId: 'brand-1',
  list: vi.fn(),
  create: vi.fn(),
  getService: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: mocks.brandId }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
    orgHref: (path: string) => `/acme/~${path}`,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: () => mocks.isIdeasEnabled,
}));

async function chooseIdeas() {
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  fireEvent.click(screen.getAllByRole('button', { name: 'From ideas' })[0]);
  fireEvent.change(screen.getByRole('textbox', { name: 'Batch name' }), {
    target: { value: 'My draft' },
  });
}

describe('BatchNewProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId = 'brand-1';
    mocks.isIdeasEnabled = true;
    mocks.getService.mockResolvedValue({
      list: mocks.list,
      create: mocks.create,
    });
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ id: 'batch-1' });
  });
  it('disables the ideas option when the batch_ideas flag is off', async () => {
    mocks.isIdeasEnabled = false;
    render(<BatchNewProjectPage />);

    const fromIdeasButton = await screen.findByRole('button', {
      name: 'From ideas',
    });
    expect(fromIdeasButton).toBeDisabled();
    expect(
      screen.getByText('Idea batches are not available right now.'),
    ).toBeInTheDocument();
  });

  it('enables the ideas option when the batch_ideas flag is on', async () => {
    mocks.isIdeasEnabled = true;
    render(<BatchNewProjectPage />);

    const fromIdeasButtons = screen.getAllByRole('button', {
      name: 'From ideas',
    });
    for (const button of fromIdeasButtons) expect(button).not.toBeDisabled();
    expect(
      screen.queryByText('Idea batches are not available right now.'),
    ).not.toBeInTheDocument();
  });
  it('waits for a brand before loading workflows', async () => {
    mocks.brandId = '';
    const { rerender } = render(<BatchNewProjectPage />);
    expect(mocks.getService).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create batch' })).toBeDisabled();
    mocks.brandId = 'brand-1';
    rerender(<BatchNewProjectPage />);
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith({ brandId: 'brand-1' }),
    );
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('shows the real workflow-loading reason', async () => {
    mocks.list.mockRejectedValue({
      errors: [{ status: '403', detail: 'Workflow access denied' }],
    });
    render(<BatchNewProjectPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Workflow access denied',
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('hides feature controls and offers centered billing for a recognized subscription denial', async () => {
    mocks.create.mockRejectedValue({
      errors: [
        {
          status: '403',
          title: 'Active subscription required',
          detail: 'Please subscribe to a plan.',
        },
      ],
    });
    render(<BatchNewProjectPage />);
    await chooseIdeas();
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please subscribe to a plan.',
    );
    expect(screen.queryByRole('textbox', { name: 'Batch name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'From ideas' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'From a workflow' }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Manage subscription' }),
    ).toHaveAttribute('href', '/acme/~/settings/subscription');
    expect(
      screen.queryByRole('button', { name: 'Create batch' }),
    ).not.toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('retains validation detail and allows an explicit corrected save with scoped navigation', async () => {
    mocks.create.mockRejectedValueOnce({
      errors: [{ status: '422', detail: 'Name is already in use' }],
    });
    render(<BatchNewProjectPage />);
    await chooseIdeas();
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Name is already in use',
    );
    expect(
      screen.queryByRole('link', { name: 'Manage subscription' }),
    ).not.toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Batch name' }), {
      target: { value: ' Corrected draft ' },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Create batch' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/acme/moonrise/studio/batch/batch-1',
      ),
    );
    expect(mocks.create).toHaveBeenLastCalledWith({
      brandId: 'brand-1',
      kind: BatchProjectKind.IDEAS,
      name: 'Corrected draft',
    });
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
});

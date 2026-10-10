import { Brand } from '@models/organization/brand.model';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import BrandMoveDialog from './brand-move-dialog';

const selectState = vi.hoisted(() => ({
  onChange: undefined as
    | ((event: ChangeEvent<HTMLSelectElement>) => void)
    | undefined,
}));
const service = vi.hoisted(() => ({
  getRelocationPreview: vi.fn(),
  relocateBrand: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ refreshBrands: vi.fn() }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => service,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

vi.mock('./use-brand-move-destinations', () => ({
  useBrandMoveDestinations: () => ({
    destinations: [{ id: 'org-2', label: 'Second org' }],
    isSuperAdmin: false,
  }),
}));

// The Radix select can't be driven in jsdom; capture its onChange instead.
vi.mock('@ui/primitives/select', () => ({
  SelectField: (props: {
    onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  }) => {
    selectState.onChange = props.onChange;
    return <div data-testid="destination-select" />;
  },
}));

function makeBrand(id: string, label: string): Brand {
  return new Brand({ id, label, slug: id } as never);
}

async function pickDestination() {
  await act(async () => {
    selectState.onChange?.({
      target: { value: 'org-2' },
    } as ChangeEvent<HTMLSelectElement>);
  });
}

const preview = {
  counts: { soleBrandWorkflows: 0, staleMembers: 1 },
  movingResources: [{ count: 4, label: 'posts', resource: 'post' }],
};

describe('BrandMoveDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectState.onChange = undefined;
  });

  function renderDialog(onMoved = vi.fn()) {
    render(
      <BrandMoveDialog
        brands={[makeBrand('b1', 'Alpha'), makeBrand('b2', 'Beta')]}
        onClose={vi.fn()}
        onMoved={onMoved}
        sourceBrandCount={5}
        sourceOrganizationId="org-1"
      />,
    );
    return onMoved;
  }

  it('shows no brand list until a destination is chosen', () => {
    renderDialog();

    expect(screen.queryByTestId('brand-move-list')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('previews every brand and lists blocked ones with the server reason', async () => {
    service.getRelocationPreview
      .mockResolvedValueOnce(preview)
      .mockRejectedValueOnce(
        new Error('Cannot move a brand with Knowledge history.'),
      );
    renderDialog();

    await pickDestination();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Move 1 brand' }),
      ).toBeEnabled(),
    );
    expect(service.getRelocationPreview).toHaveBeenCalledWith('b1', 'org-2');
    expect(service.getRelocationPreview).toHaveBeenCalledWith('b2', 'org-2');
    expect(screen.getByTestId('brand-move-b1')).toHaveTextContent(
      '4 posts. 1 member will lose access.',
    );
    expect(screen.getByTestId('brand-move-b2')).toHaveTextContent(
      'Cannot move a brand with Knowledge history.',
    );
  });

  it('moves only the ready brands and keeps going after a failure', async () => {
    service.getRelocationPreview.mockResolvedValue(preview);
    service.relocateBrand
      .mockResolvedValueOnce({ summary: { membersSevered: 1 } })
      .mockRejectedValueOnce(
        new Error('A record in the destination conflicts.'),
      );
    const onMoved = renderDialog();

    await pickDestination();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Move 2 brands' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move 2 brands' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument(),
    );
    expect(service.relocateBrand).toHaveBeenNthCalledWith(1, 'b1', {
      organizationId: 'org-2',
    });
    expect(service.relocateBrand).toHaveBeenNthCalledWith(2, 'b2', {
      organizationId: 'org-2',
    });
    expect(screen.getByTestId('brand-move-b1')).toHaveTextContent('Moved');
    expect(screen.getByTestId('brand-move-b2')).toHaveTextContent(
      'A record in the destination conflicts.',
    );
    expect(onMoved).toHaveBeenCalledTimes(1);
  });
});

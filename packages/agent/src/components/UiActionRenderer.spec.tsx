import { UiActionRenderer } from '@genfeedai/agent/components/UiActionRenderer';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const brandCreateProps = vi.fn();
const generationActionProps = vi.fn();

// Capture the props BrandCreateCard receives so we can assert the onCreate
// handler is threaded all the way to the card (previously a dead wire).
vi.mock('@genfeedai/agent/components/BrandCreateCard', () => ({
  BrandCreateCard: (props: { onCreate?: unknown }) => {
    brandCreateProps(props);
    return <div data-testid="brand-create-card" />;
  },
}));

vi.mock('@genfeedai/agent/components/GenerationActionCard', () => ({
  GenerationActionCard: (props: { apiService?: unknown }) => {
    generationActionProps(props);
    return <div data-testid="generation-action-card" />;
  },
}));

describe('UiActionRenderer', () => {
  it('forwards onBrandCreate to BrandCreateCard.onCreate for brand_create_card', () => {
    const onBrandCreate = vi.fn();
    const action = {
      id: 'brand-create-1',
      type: 'brand_create_card',
    } as AgentUiAction;

    render(<UiActionRenderer action={action} onBrandCreate={onBrandCreate} />);

    expect(screen.getByTestId('brand-create-card')).toBeInTheDocument();
    expect(brandCreateProps).toHaveBeenCalledTimes(1);
    expect(brandCreateProps.mock.calls[0][0].onCreate).toBe(onBrandCreate);
  });

  it('makes archived cards inert and drops onCreate handlers', () => {
    const onBrandCreate = vi.fn();
    const action = {
      id: 'brand-create-archived',
      type: 'brand_create_card',
    } as AgentUiAction;

    render(
      <UiActionRenderer
        action={action}
        isReadOnly
        onBrandCreate={onBrandCreate}
      />,
    );

    const shell = screen.getByTestId('ui-action-archived-readonly');
    expect(shell).toBeInTheDocument();
    expect(shell).toHaveAttribute('inert');
    expect(brandCreateProps.mock.calls.at(-1)?.[0].onCreate).toBeUndefined();
  });

  it('does not mount apiService mutation cards while the thread is archived', () => {
    const apiService = { createGeneration: vi.fn() };
    const action = {
      id: 'gen-1',
      type: 'generation_action_card',
    } as AgentUiAction;

    const { rerender } = render(
      <UiActionRenderer
        action={action}
        apiService={apiService as never}
        isReadOnly={false}
      />,
    );

    expect(screen.getByTestId('generation-action-card')).toBeInTheDocument();
    expect(generationActionProps.mock.calls.at(-1)?.[0].apiService).toBe(
      apiService,
    );

    generationActionProps.mockClear();
    rerender(
      <UiActionRenderer
        action={action}
        apiService={apiService as never}
        isReadOnly
      />,
    );

    // No liveApiService → card returns null (no mutation surface).
    expect(
      screen.queryByTestId('generation-action-card'),
    ).not.toBeInTheDocument();
    expect(generationActionProps).not.toHaveBeenCalled();
  });
});

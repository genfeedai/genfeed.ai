import { UiActionRenderer } from '@genfeedai/agent/components/UiActionRenderer';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const brandCreateProps = vi.fn();

// Capture the props BrandCreateCard receives so we can assert the onCreate
// handler is threaded all the way to the card (previously a dead wire).
vi.mock('@genfeedai/agent/components/BrandCreateCard', () => ({
  BrandCreateCard: (props: { onCreate?: unknown }) => {
    brandCreateProps(props);
    return <div data-testid="brand-create-card" />;
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
});

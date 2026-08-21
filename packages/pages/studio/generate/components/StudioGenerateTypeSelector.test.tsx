import StudioGenerateTypeSelector from '@pages/studio/generate/components/StudioGenerateTypeSelector';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('StudioGenerateTypeSelector', () => {
  it('uses ghost toolbar chrome and canonical menu icon sizing', async () => {
    render(<StudioGenerateTypeSelector onChange={vi.fn()} type="image" />);

    const trigger = screen.getByRole('button', { name: 'Asset type' });
    expect(trigger).not.toHaveClass('border', 'bg-background');
    expect(trigger.querySelector('svg')).toHaveClass('size-3.5');

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const imageOption = await screen.findByRole('menuitem', { name: 'Image' });
    expect(imageOption.querySelector('svg')).toHaveClass('size-4');
  });
});

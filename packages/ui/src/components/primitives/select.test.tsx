import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { describe, expect, it, vi } from 'vitest';

describe('Select', () => {
  it('applies the shared field surface classes to the trigger', () => {
    render(
      <Select value="views">
        <SelectTrigger className="custom-class">
          <SelectValue placeholder="Pick a metric" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="views">Views</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('custom-class');
    expect(trigger).toHaveClass('h-9');
    expect(trigger).toHaveClass('border-white/[0.06]');
  });

  it('renders the selected item label for controlled values', () => {
    const { rerender } = render(
      <Select value="views" onValueChange={vi.fn()}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a metric" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="views">Views</SelectItem>
          <SelectItem value="engagement">Engagement</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Views');

    rerender(
      <Select value="engagement" onValueChange={vi.fn()}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a metric" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="views">Views</SelectItem>
          <SelectItem value="engagement">Engagement</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Engagement');
  });
});

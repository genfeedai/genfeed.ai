import { ComponentSize } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import FormSearchbar from '@ui/primitives/searchbar';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

describe('FormSearchbar', () => {
  describe('Basic Rendering', () => {
    it('renders search input with default placeholder', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} />);
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toBeInTheDocument();
    });

    it('renders with custom placeholder', () => {
      render(
        <FormSearchbar
          value=""
          onChange={vi.fn()}
          placeholder="Search users..."
        />,
      );
      expect(
        screen.getByPlaceholderText('Search users...'),
      ).toBeInTheDocument();
    });

    it('renders with provided value', () => {
      render(<FormSearchbar value="test query" onChange={vi.fn()} />);
      const input = screen.getByDisplayValue('test query');
      expect(input).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <FormSearchbar value="" onChange={vi.fn()} className="custom-class" />,
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('applies custom inputClassName', () => {
      render(
        <FormSearchbar
          value=""
          onChange={vi.fn()}
          inputClassName="custom-input-class"
        />,
      );
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toHaveClass('custom-input-class');
    });
  });

  describe('Search Icon', () => {
    it('shows search icon by default', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} />);
      const icon = document.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('hides search icon when showIcon is false', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} showIcon={false} />);
      const icons = document.querySelectorAll('svg');
      // Should only have clear button icon if value exists, but we have no value
      expect(icons.length).toBe(0);
    });

    it('applies correct padding when icon is shown', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} showIcon={true} />);
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toHaveClass('pl-10');
    });

    it('does not apply padding when icon is hidden', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} showIcon={false} />);
      const input = screen.getByPlaceholderText('Search...');
      expect(input).not.toHaveClass('pl-10');
    });
  });

  describe('Clear Button', () => {
    it('shows clear button when value exists and showClearButton is true', () => {
      render(<FormSearchbar value="test" onChange={vi.fn()} />);
      const clearButton = screen.getByRole('button');
      expect(clearButton).toBeInTheDocument();
    });

    it('hides clear button when value is empty', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} />);
      const buttons = screen.queryAllByRole('button');
      expect(buttons.length).toBe(0);
    });

    it('hides clear button when showClearButton is false', () => {
      render(
        <FormSearchbar
          value="test"
          onChange={vi.fn()}
          showClearButton={false}
        />,
      );
      const buttons = screen.queryAllByRole('button');
      expect(buttons.length).toBe(0);
    });

    it('calls onClear when clear button is clicked', () => {
      const onClear = vi.fn();
      render(
        <FormSearchbar value="test" onChange={vi.fn()} onClear={onClear} />,
      );
      const clearButton = screen.getByRole('button');
      fireEvent.click(clearButton);
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('calls onChange with empty value when clear button is clicked and no onClear provided', () => {
      const onChange = vi.fn();
      render(<FormSearchbar value="test" onChange={onChange} />);
      const clearButton = screen.getByRole('button');
      fireEvent.click(clearButton);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: '' }),
        }),
      );
    });

    it('focuses input after clearing', () => {
      const inputRef = createRef<HTMLInputElement>();
      render(
        <FormSearchbar value="test" onChange={vi.fn()} inputRef={inputRef} />,
      );
      const clearButton = screen.getByRole('button');

      // Mock focus
      const focusSpy = vi.fn();
      if (inputRef.current) {
        inputRef.current.focus = focusSpy;
      }

      fireEvent.click(clearButton);
      expect(focusSpy).toHaveBeenCalled();
    });
  });

  describe('Size Variants', () => {
    it('applies small size classes by default', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} />);
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toHaveClass('h-8');
      expect(input).toHaveClass('text-sm');
    });

    it('applies large size classes', () => {
      render(
        <FormSearchbar value="" onChange={vi.fn()} size={ComponentSize.LG} />,
      );
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toHaveClass('h-12');
      expect(input).toHaveClass('text-base');
    });

    it('applies medium size classes', () => {
      render(
        <FormSearchbar value="" onChange={vi.fn()} size={ComponentSize.MD} />,
      );
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toHaveClass('h-10');
      expect(input).toHaveClass('text-sm');
    });

    it('applies extra small size classes', () => {
      render(
        <FormSearchbar value="" onChange={vi.fn()} size={ComponentSize.XS} />,
      );
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toHaveClass('h-6');
      expect(input).toHaveClass('text-xs');
    });
  });

  describe('Event Handlers', () => {
    it('calls onChange when input value changes', () => {
      const onChange = vi.fn();
      render(<FormSearchbar value="" onChange={onChange} />);
      const input = screen.getByPlaceholderText('Search...');
      fireEvent.change(input, { target: { value: 'new value' } });
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('calls onClick when input is clicked', () => {
      const onClick = vi.fn();
      render(<FormSearchbar value="" onChange={vi.fn()} onClick={onClick} />);
      const input = screen.getByPlaceholderText('Search...');
      fireEvent.click(input);
      expect(onClick).toHaveBeenCalled();
    });

    it('calls onKeyDown when key is pressed', () => {
      const onKeyDown = vi.fn();
      render(
        <FormSearchbar value="" onChange={vi.fn()} onKeyDown={onKeyDown} />,
      );
      const input = screen.getByPlaceholderText('Search...');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onKeyDown).toHaveBeenCalled();
    });
  });

  describe('Disabled State', () => {
    it('disables input when isDisabled is true', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} isDisabled />);
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toBeDisabled();
    });

    it('enables input when isDisabled is false', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} isDisabled={false} />);
      const input = screen.getByPlaceholderText('Search...');
      expect(input).not.toBeDisabled();
    });
  });

  describe('Input Ref', () => {
    it('forwards ref to input element', () => {
      const inputRef = createRef<HTMLInputElement>();
      render(<FormSearchbar value="" onChange={vi.fn()} inputRef={inputRef} />);
      expect(inputRef.current).toBeInstanceOf(HTMLInputElement);
      expect(inputRef.current?.type).toBe('text');
    });
  });

  describe('Padding with Clear Button', () => {
    it('applies right padding when clear button is shown', () => {
      render(<FormSearchbar value="test" onChange={vi.fn()} />);
      const input = screen.getByDisplayValue('test');
      expect(input).toHaveClass('pr-8');
    });

    it('does not apply right padding when clear button is hidden', () => {
      render(<FormSearchbar value="" onChange={vi.fn()} />);
      const input = screen.getByPlaceholderText('Search...');
      expect(input).not.toHaveClass('pr-8');
    });
  });
});

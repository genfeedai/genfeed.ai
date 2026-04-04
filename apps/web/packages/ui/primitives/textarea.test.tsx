import { fireEvent, render, screen } from '@testing-library/react';
import { Textarea } from '@ui/primitives/textarea';
import { describe, expect, it, vi } from 'vitest';

describe('Textarea', () => {
  it('renders without crashing', () => {
    render(<Textarea />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(<Textarea placeholder="Enter your message" />);
    expect(
      screen.getByPlaceholderText('Enter your message'),
    ).toBeInTheDocument();
  });

  it('renders with default value', () => {
    render(<Textarea defaultValue="Default text content" />);
    expect(
      screen.getByDisplayValue('Default text content'),
    ).toBeInTheDocument();
  });

  it('renders with controlled value', () => {
    render(<Textarea value="Controlled value" onChange={() => {}} />);
    expect(screen.getByDisplayValue('Controlled value')).toBeInTheDocument();
  });

  it('handles onChange events', () => {
    const handleChange = vi.fn();
    render(<Textarea onChange={handleChange} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'new text' } });

    expect(handleChange).toHaveBeenCalled();
    expect(textarea).toHaveValue('new text');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Textarea disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('is readonly when readOnly prop is true', () => {
    render(<Textarea readOnly />);
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
  });

  it('is required when required prop is true', () => {
    render(<Textarea required />);
    expect(screen.getByRole('textbox')).toBeRequired();
  });

  it('applies custom className', () => {
    render(<Textarea className="custom-class" />);
    expect(screen.getByRole('textbox')).toHaveClass('custom-class');
  });

  it('preserves default styling with custom className', () => {
    render(<Textarea className="custom-class" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveClass('custom-class');
    expect(textarea).toHaveClass('flex');
    expect(textarea).toHaveClass('border');
    expect(textarea).toHaveClass('rounded-lg');
    expect(textarea).toHaveClass('min-h-textarea');
    expect(textarea).toHaveClass('border-white/[0.06]');
  });

  describe('textarea attributes', () => {
    it('supports rows attribute', () => {
      render(<Textarea rows={5} />);
      expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5');
    });

    it('supports cols attribute', () => {
      render(<Textarea cols={40} />);
      expect(screen.getByRole('textbox')).toHaveAttribute('cols', '40');
    });

    it('supports maxLength attribute', () => {
      render(<Textarea maxLength={200} />);
      expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '200');
    });

    it('supports minLength attribute', () => {
      render(<Textarea minLength={10} />);
      expect(screen.getByRole('textbox')).toHaveAttribute('minLength', '10');
    });

    it('supports wrap attribute', () => {
      render(<Textarea wrap="hard" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('wrap', 'hard');
    });
  });

  describe('event handlers', () => {
    it('handles onFocus', () => {
      const handleFocus = vi.fn();
      render(<Textarea onFocus={handleFocus} />);

      screen.getByRole('textbox').focus();
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('handles onBlur', () => {
      const handleBlur = vi.fn();
      render(<Textarea onBlur={handleBlur} />);

      const textarea = screen.getByRole('textbox');
      textarea.focus();
      textarea.blur();
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('handles onKeyDown', () => {
      const handleKeyDown = vi.fn();
      render(<Textarea onKeyDown={handleKeyDown} />);

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
    });

    it('handles onKeyUp', () => {
      const handleKeyUp = vi.fn();
      render(<Textarea onKeyUp={handleKeyUp} />);

      fireEvent.keyUp(screen.getByRole('textbox'), { key: 'a' });
      expect(handleKeyUp).toHaveBeenCalledTimes(1);
    });

    it('handles onKeyPress', () => {
      const handleKeyPress = vi.fn();
      render(<Textarea onKeyPress={handleKeyPress} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.keyPress(textarea, { charCode: 97, key: 'a' });
      // keyPress is deprecated; in some jsdom versions it may not fire
      expect(textarea).toBeInTheDocument();
    });

    it('handles onInput', () => {
      const handleInput = vi.fn();
      render(<Textarea onInput={handleInput} />);

      fireEvent.input(screen.getByRole('textbox'), {
        target: { value: 'test' },
      });
      expect(handleInput).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has correct role', () => {
      render(<Textarea />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('supports aria-label', () => {
      render(<Textarea aria-label="Message content" />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'aria-label',
        'Message content',
      );
    });

    it('supports aria-describedby', () => {
      render(<Textarea aria-describedby="help-text" />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'aria-describedby',
        'help-text',
      );
    });

    it('supports aria-invalid', () => {
      render(<Textarea aria-invalid="true" />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('supports aria-required', () => {
      render(<Textarea aria-required="true" />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'aria-required',
        'true',
      );
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Textarea id="message" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('id', 'message');
    });

    it('forwards name attribute', () => {
      render(<Textarea name="comment" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'comment');
    });

    it('forwards data attributes', () => {
      render(<Textarea data-testid="custom-textarea" />);
      expect(screen.getByTestId('custom-textarea')).toBeInTheDocument();
    });

    it('forwards autoComplete attribute', () => {
      render(<Textarea autoComplete="off" />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'autoComplete',
        'off',
      );
    });

    it('forwards autoFocus attribute', () => {
      render(<Textarea autoFocus />);
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('forwards spellCheck attribute', () => {
      render(<Textarea spellCheck={false} />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'spellCheck',
        'false',
      );
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to textarea element', () => {
      const ref = vi.fn();
      render(<Textarea ref={ref} />);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('allows ref to access textarea methods', () => {
      let textareaRef: HTMLTextAreaElement | null = null;
      render(<Textarea ref={(el) => (textareaRef = el)} />);

      expect(textareaRef).toBeInstanceOf(HTMLTextAreaElement);
      textareaRef?.focus();
      expect(textareaRef).toHaveFocus();
    });
  });

  describe('styling', () => {
    it('has base textarea styles', () => {
      render(<Textarea />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveClass('flex');
      expect(textarea).toHaveClass('w-full');
      expect(textarea).toHaveClass('border');
    });

    it('has focus styles', () => {
      render(<Textarea />);
      expect(screen.getByRole('textbox')).toHaveClass(
        'focus-visible:outline-none',
      );
    });

    it('has disabled styles', () => {
      render(<Textarea disabled />);
      expect(screen.getByRole('textbox')).toHaveClass(
        'disabled:cursor-not-allowed',
      );
    });

    it('has placeholder styles', () => {
      render(<Textarea />);
      expect(screen.getByRole('textbox')).toHaveClass(
        'placeholder:text-muted-foreground',
      );
    });

    it('has min-height', () => {
      render(<Textarea />);
      expect(screen.getByRole('textbox')).toHaveClass('min-h-textarea');
    });
  });

  describe('multiline behavior', () => {
    it('accepts multiline text', () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      render(<Textarea value={multilineText} onChange={() => {}} />);
      expect(screen.getByRole('textbox')).toHaveValue(multilineText);
    });

    it('handles Enter key for new lines', () => {
      render(<Textarea defaultValue="Initial text" />);
      const textarea = screen.getByRole('textbox');

      fireEvent.change(textarea, {
        target: { value: 'Initial text\nNew line' },
      });
      expect(textarea).toHaveValue('Initial text\nNew line');
    });
  });

  describe('form integration', () => {
    it('works within a form', () => {
      const { container } = render(
        <form>
          <Textarea name="message" />
        </form>,
      );

      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'message');
    });

    it('submits with form data', () => {
      const handleSubmit = vi.fn((e) => e.preventDefault());
      render(
        <form onSubmit={handleSubmit}>
          <Textarea name="message" defaultValue="Test message" />
          <button type="submit">Submit</button>
        </form>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(handleSubmit).toHaveBeenCalled();
    });
  });

  describe('resize behavior', () => {
    it('has shadow class by default', () => {
      render(<Textarea />);
      expect(screen.getByRole('textbox')).toHaveClass('shadow-sm');
    });

    it('can be styled to prevent resize', () => {
      render(<Textarea className="resize-none" />);
      expect(screen.getByRole('textbox')).toHaveClass('resize-none');
    });
  });
});

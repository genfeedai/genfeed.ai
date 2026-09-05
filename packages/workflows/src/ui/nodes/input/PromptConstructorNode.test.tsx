import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prettyPrintPromptJson } from '../../../engine/executors/saas/prompt-json';
import { PromptConstructorNode } from './PromptConstructorNode';

const formatToggle = vi.hoisted(() => ({
  onValueChange: (_value: string): void => undefined,
}));

vi.mock('@genfeedai/ui', () => ({
  Textarea: ({
    ref,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    ref?: React.Ref<HTMLTextAreaElement>;
  }) => <textarea ref={ref} {...props} />,
  ToggleGroup: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (next: string) => void;
    value?: string;
  }) => {
    if (onValueChange) {
      formatToggle.onValueChange = onValueChange;
    }
    return (
      <div data-testid="prompt-format-toggle" data-value={value}>
        {children}
      </div>
    );
  },
  ToggleGroupItem: ({
    children,
    value,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) => (
    <button
      type="button"
      {...props}
      onClick={() => formatToggle.onValueChange(value)}
    >
      {children}
    </button>
  ),
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('../BaseNode', () => ({
  BaseNode: ({
    children,
    headerActions,
  }: {
    children: React.ReactNode;
    headerActions?: React.ReactNode;
  }) => (
    <div data-testid="base-node">
      {headerActions}
      {children}
    </div>
  ),
}));

const mockUpdateNodeData = vi.fn();

vi.mock('../../stores/workflow', () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) => {
    const state = {
      edges: [],
      nodes: [],
      updateNodeData: mockUpdateNodeData,
    };
    return selector(state);
  },
}));

describe('PromptConstructorNode', () => {
  const defaultProps = {
    data: {
      label: 'Prompt Constructor',
      outputText: null,
      promptFormat: 'text' as const,
      status: 'idle',
      structuredPrompt: null,
      template: '',
      unresolvedVars: [],
    },
    deletable: true,
    draggable: true,
    dragging: false,
    dragHandle: '',
    id: 'prompt-constructor-1',
    isConnectable: true,
    parentId: undefined,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: true,
    selected: false,
    type: 'promptConstructor',
    zIndex: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the template textarea and format toggle', () => {
    render(<PromptConstructorNode {...defaultProps} />);

    expect(
      screen.getByPlaceholderText('Type @ to insert variables...'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toBeInTheDocument();
    expect(screen.getByLabelText('JSON')).toBeInTheDocument();
  });

  it('persists JSON mode and a parsed object when toggling valid JSON', () => {
    render(
      <PromptConstructorNode
        {...defaultProps}
        data={{
          ...defaultProps.data,
          template: '{"scene":"night","camera":"dolly"}',
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText('JSON'));

    expect(mockUpdateNodeData).toHaveBeenCalledWith('prompt-constructor-1', {
      promptFormat: 'json',
      structuredPrompt: { scene: 'night', camera: 'dolly' },
      template: prettyPrintPromptJson({
        scene: 'night',
        camera: 'dolly',
      }),
    });
  });

  it('pretty-prints valid JSON on blur and round-trips the object', () => {
    render(
      <PromptConstructorNode
        {...defaultProps}
        data={{
          ...defaultProps.data,
          promptFormat: 'json',
          template: '{"scene":"night"}',
        }}
      />,
    );

    const textarea = screen.getByPlaceholderText('{"scene":"","camera":""}');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, {
      target: { value: '{"scene":"night","shot":"wide"}' },
    });
    fireEvent.blur(textarea);

    expect(mockUpdateNodeData).toHaveBeenCalledWith('prompt-constructor-1', {
      promptFormat: 'json',
      structuredPrompt: { scene: 'night', shot: 'wide' },
      template: prettyPrintPromptJson({ scene: 'night', shot: 'wide' }),
    });
    expect(textarea).toHaveValue(
      prettyPrintPromptJson({ scene: 'night', shot: 'wide' }),
    );
  });

  it('shows a non-blocking warning for invalid JSON and still saves draft text', () => {
    render(
      <PromptConstructorNode
        {...defaultProps}
        data={{
          ...defaultProps.data,
          promptFormat: 'json',
          template: '{"scene":',
        }}
      />,
    );

    expect(screen.getByTestId('json-warning')).toHaveTextContent(
      'Invalid JSON',
    );

    const textarea = screen.getByPlaceholderText('{"scene":"","camera":""}');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: '{"scene": "draft"' } });
    fireEvent.blur(textarea);

    expect(mockUpdateNodeData).toHaveBeenCalledWith('prompt-constructor-1', {
      promptFormat: 'json',
      structuredPrompt: null,
      template: '{"scene": "draft"',
    });
  });

  it('pretty-prints valid JSON after paste without blocking the draft', async () => {
    render(
      <PromptConstructorNode
        {...defaultProps}
        data={{
          ...defaultProps.data,
          promptFormat: 'json',
          template: '',
        }}
      />,
    );

    const textarea = screen.getByPlaceholderText('{"scene":"","camera":""}');
    fireEvent.focus(textarea);
    fireEvent.paste(textarea, {
      clipboardData: { getData: () => '{"scene":"night"}' },
    });
    fireEvent.change(textarea, { target: { value: '{"scene":"night"}' } });

    await waitFor(() => {
      expect(textarea).toHaveValue(prettyPrintPromptJson({ scene: 'night' }));
    });
  });

  it('leaves no deferred state update behind when the node unmounts', () => {
    vi.useFakeTimers();

    try {
      const { unmount } = render(
        <PromptConstructorNode
          {...defaultProps}
          data={{
            ...defaultProps.data,
            promptFormat: 'json',
            template: '',
          }}
        />,
      );

      const textarea = screen.getByPlaceholderText('{"scene":"","camera":""}');
      fireEvent.focus(textarea);
      fireEvent.paste(textarea, {
        clipboardData: { getData: () => '{"scene":"night"}' },
      });
      fireEvent.change(textarea, { target: { value: '{"scene":"night"}' } });
      fireEvent.blur(textarea);

      unmount();

      // Both the paste reformat and the 200ms autocomplete close set state on a
      // delay. Untracked, they fire into a torn-down tree — in CI that surfaced
      // as `ReferenceError: window is not defined` after the suite had finished.
      expect(vi.getTimerCount()).toBe(0);
      expect(() =>
        act(() => {
          vi.runAllTimers();
        }),
      ).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not pretty-print on every keystroke', () => {
    render(
      <PromptConstructorNode
        {...defaultProps}
        data={{
          ...defaultProps.data,
          promptFormat: 'json',
          template: '',
        }}
      />,
    );

    const textarea = screen.getByPlaceholderText('{"scene":"","camera":""}');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: '{"a":1}' } });

    expect(textarea).toHaveValue('{"a":1}');
    expect(mockUpdateNodeData).not.toHaveBeenCalled();
  });

  it('keeps text mode as free-form template authoring', () => {
    render(
      <PromptConstructorNode
        {...defaultProps}
        data={{ ...defaultProps.data, template: 'Hello @name' }}
      />,
    );

    const textarea = screen.getByPlaceholderText(
      'Type @ to insert variables...',
    );
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'Hello @name and @place' } });
    fireEvent.blur(textarea);

    expect(mockUpdateNodeData).toHaveBeenCalledWith('prompt-constructor-1', {
      template: 'Hello @name and @place',
    });
    expect(screen.queryByTestId('json-warning')).not.toBeInTheDocument();
  });

  it('does not throw when toggling JSON with empty draft text', () => {
    render(<PromptConstructorNode {...defaultProps} />);

    act(() => {
      fireEvent.click(screen.getByLabelText('JSON'));
    });

    expect(mockUpdateNodeData).toHaveBeenCalledWith('prompt-constructor-1', {
      promptFormat: 'json',
      structuredPrompt: null,
      template: '',
    });
  });
});

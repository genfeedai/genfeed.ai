import type { CubicBezier } from '@genfeedai/contracts/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CubicBezierEditor } from './CubicBezierEditor';

beforeAll(() => {
  // jsdom does not implement pointer capture.
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => undefined,
    writable: true,
  });
});

const DEFAULT_VALUE: CubicBezier = [0.42, 0, 0.58, 1];

function renderEditor(overrides: Partial<{ disabled: boolean }> = {}) {
  const onChange = vi.fn<(value: CubicBezier) => void>();
  const onCommit = vi.fn<(value: CubicBezier) => void>();
  const utils = render(
    <CubicBezierEditor
      disabled={overrides.disabled}
      onChange={onChange}
      onCommit={onCommit}
      value={DEFAULT_VALUE}
    />,
  );
  const svg = utils.container.querySelector('svg') as SVGSVGElement;
  const circles = utils.container.querySelectorAll('circle');
  // Circle order: p0 endpoint, p3 endpoint, control 1, control 2.
  return {
    control1: circles[2],
    control2: circles[3],
    onChange,
    onCommit,
    svg,
    ...utils,
  };
}

describe('CubicBezierEditor', () => {
  it('renders the control point coordinates', () => {
    renderEditor();
    expect(screen.getByText('P1: (0.42, 0.00)')).toBeInTheDocument();
    expect(screen.getByText('P2: (0.58, 1.00)')).toBeInTheDocument();
  });

  it('dragging control point 1 emits onChange with new coordinates', () => {
    const { control1, onChange, svg } = renderEditor();
    svg.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;

    fireEvent.pointerDown(control1, { pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 120, clientY: 120 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    // x = (120 - 16) / 208 = 0.5, y = 1 - 0.5 = 0.5
    expect(next[0]).toBeCloseTo(0.5, 2);
    expect(next[1]).toBeCloseTo(0.5, 2);
    // Control 2 untouched
    expect(next[2]).toBe(0.58);
    expect(next[3]).toBe(1);
  });

  it('dragging control point 2 updates the second handle', () => {
    const { control2, onChange, svg } = renderEditor();
    svg.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;

    fireEvent.pointerDown(control2, { pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 224, clientY: 16 });

    const next = onChange.mock.calls[0][0];
    expect(next[2]).toBeCloseTo(1, 2);
    expect(next[3]).toBeCloseTo(1, 2);
  });

  it('clamps x into [0,1] and y into [-0.5,1.5]', () => {
    const { control1, onChange, svg } = renderEditor();
    svg.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;

    fireEvent.pointerDown(control1, { pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: -500, clientY: 10_000 });

    const next = onChange.mock.calls[0][0];
    expect(next[0]).toBe(0);
    expect(next[1]).toBe(-0.5);
  });

  it('pointer up commits the current value and stops dragging', () => {
    const { control1, onChange, onCommit, svg } = renderEditor();
    svg.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;

    fireEvent.pointerDown(control1, { pointerId: 1 });
    fireEvent.pointerUp(svg);
    expect(onCommit).toHaveBeenCalledWith(DEFAULT_VALUE);

    fireEvent.pointerMove(svg, { clientX: 120, clientY: 120 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pointer leave also ends the drag', () => {
    const { control1, onCommit, svg } = renderEditor();
    fireEvent.pointerDown(control1, { pointerId: 1 });
    fireEvent.pointerLeave(svg);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('ignores interaction when disabled', () => {
    const { control1, onChange, svg } = renderEditor({ disabled: true });
    fireEvent.pointerDown(control1, { pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 120, clientY: 120 });

    expect(onChange).not.toHaveBeenCalled();
  });
});

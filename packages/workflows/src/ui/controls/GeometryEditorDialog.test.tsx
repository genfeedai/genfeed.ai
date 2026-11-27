import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GeometryEditorDialog from './GeometryEditorDialog';
import { renderWithMessages } from './testMessages';

function stage(): HTMLElement {
  return screen.getByRole('application');
}

function press(key: string, options: { ctrlKey?: boolean } = {}) {
  fireEvent.keyDown(stage(), { key, ...options });
}

function pickTool(name: string) {
  fireEvent.click(screen.getByRole('radio', { name }));
}

/** A 100 by 100 stage at the page origin, so a pointer at (x, y) is x%, y%. */
function sizeStage(): HTMLElement {
  const element = stage();
  element.getBoundingClientRect = () =>
    ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
    }) as DOMRect;
  return element;
}

function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  target: Element = stage(),
) {
  fireEvent(
    target,
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
  );
}

function savedShapes(onSaveShapes: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole('button', { name: 'Save annotations' }));
  return onSaveShapes.mock.calls[0][0];
}

function renderAnnotation(
  props: Partial<Parameters<typeof GeometryEditorDialog>[0]> = {},
) {
  const onSaveShapes = vi.fn();
  const onOpenChange = vi.fn();
  renderWithMessages(
    <GeometryEditorDialog
      imageAspect={1}
      imageSrc="/frame.png"
      mode="annotation"
      onOpenChange={onOpenChange}
      onSaveShapes={onSaveShapes}
      {...props}
    />,
  );
  return { onOpenChange, onSaveShapes };
}

function renderTrajectory(
  props: Partial<Parameters<typeof GeometryEditorDialog>[0]> = {},
) {
  const onSavePoints = vi.fn();
  renderWithMessages(
    <GeometryEditorDialog
      durationSeconds={5}
      imageAspect={1}
      imageSrc="/frame.png"
      mode="trajectory"
      onOpenChange={vi.fn()}
      onSavePoints={onSavePoints}
      {...props}
    />,
  );
  return { onSavePoints };
}

describe('GeometryEditorDialog annotations', () => {
  it('places the chosen shape at the keyboard cursor and saves it normalized', () => {
    const { onOpenChange, onSaveShapes } = renderAnnotation();

    pickTool('Rectangle');
    stage().focus();
    press('Enter');

    expect(screen.getByRole('button', { name: 'Rectangle 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save annotations' }));

    expect(onSaveShapes).toHaveBeenCalledTimes(1);
    const [saved] = onSaveShapes.mock.calls[0][0];
    expect(saved).toMatchObject({
      height: 0.16,
      kind: 'rectangle',
      width: 0.22,
      x: 0.39,
      y: 0.42,
    });
    expect(typeof saved.id).toBe('string');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('moves the selection with the arrow keys, a bigger step with Shift', () => {
    const { onSaveShapes } = renderAnnotation();
    pickTool('Rectangle');
    press('Enter');

    press('ArrowRight');
    fireEvent.keyDown(stage(), { key: 'ArrowDown', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotations' }));

    const [saved] = onSaveShapes.mock.calls[0][0];
    expect(saved.x).toBeCloseTo(0.4);
    expect(saved.y).toBeCloseTo(0.47);
  });

  it('undoes a placement and a delete, and clears everything', () => {
    renderAnnotation();
    pickTool('Ellipse');
    press('Enter');
    expect(screen.getByRole('button', { name: 'Ellipse 1' })).toBeTruthy();

    press('Delete');
    expect(screen.queryByRole('button', { name: 'Ellipse 1' })).toBeNull();

    press('z', { ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Ellipse 1' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByRole('button', { name: 'Ellipse 1' })).toBeNull();
    expect(
      screen.getByText('Pick a tool, then draw on the image.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Ellipse 1' })).toBeTruthy();
  });

  it('names an invalid shape and clears the error once it is fixed', () => {
    renderAnnotation();
    pickTool('Text');
    press('Enter');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Text 1 is empty. Type its text or delete it.',
    );
    expect(screen.getByText('Fix')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Label text'), {
      target: { value: 'Look here' },
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('flags a shape moved off the image', () => {
    renderAnnotation({
      initialShapes: [
        {
          height: 0.2,
          id: 'edge',
          kind: 'rectangle',
          width: 0.25,
          x: 0.7,
          y: 0.1,
        },
      ],
    });
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rectangle 1' }));
    fireEvent.keyDown(stage(), { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(stage(), { key: 'ArrowRight', shiftKey: true });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Rectangle 1 extends outside the image.',
    );
  });

  it('keeps Delete and Ctrl Z from reaching the canvas shortcuts behind the dialog', () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    renderAnnotation();
    pickTool('Rectangle');
    press('Enter');

    press('Delete');
    press('z', { ctrlKey: true });
    window.removeEventListener('keydown', onWindowKey);

    expect(onWindowKey).not.toHaveBeenCalled();
  });

  it('discards edits on cancel', () => {
    const { onOpenChange, onSaveShapes } = renderAnnotation();
    pickTool('Rectangle');
    press('Enter');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSaveShapes).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('opens with saved shapes and keeps their ids', () => {
    const { onSaveShapes } = renderAnnotation({
      initialShapes: [
        {
          height: 0.2,
          id: 'saved-1',
          kind: 'rectangle',
          width: 0.3,
          x: 0.1,
          y: 0.1,
        },
      ],
    });

    expect(screen.getByRole('button', { name: 'Rectangle 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save annotations' }));

    expect(onSaveShapes.mock.calls[0][0][0].id).toBe('saved-1');
  });
});

describe('GeometryEditorDialog trajectory', () => {
  it('asks for a second point before the path is valid', () => {
    renderTrajectory();
    stage().focus();
    press('Enter');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The path needs at least 2 points.',
    );

    press('ArrowRight', {});
    press('Enter');

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('spreads the saved points evenly over the clip', () => {
    const { onSavePoints } = renderTrajectory();
    press('Enter');
    fireEvent.keyDown(stage(), { key: 'ArrowRight', shiftKey: true });
    press('Enter');
    fireEvent.keyDown(stage(), { key: 'ArrowDown', shiftKey: true });
    press('Enter');

    fireEvent.click(screen.getByRole('button', { name: 'Save trajectory' }));

    const saved = onSavePoints.mock.calls[0][0];
    expect(saved.map((point: { frame: number }) => point.frame)).toEqual([
      0, 60, 119,
    ]);
    expect(saved).toHaveLength(3);
  });

  it('keeps frames in order after a point is deleted', () => {
    const { onSavePoints } = renderTrajectory();
    press('Enter');
    press('ArrowRight');
    press('Enter');
    press('ArrowRight');
    press('Enter');

    fireEvent.click(screen.getByRole('button', { name: 'Delete point 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save trajectory' }));

    expect(
      onSavePoints.mock.calls[0][0].map(
        (point: { frame: number }) => point.frame,
      ),
    ).toEqual([0, 119]);
  });
});

describe('GeometryEditorDialog pointer drawing', () => {
  it('draws a rectangle by dragging, from any corner', () => {
    const { onSaveShapes } = renderAnnotation();
    sizeStage();
    pickTool('Rectangle');

    pointer('pointerdown', 60, 70);
    pointer('pointermove', 20, 30);
    pointer('pointerup', 20, 30);

    const [saved] = savedShapes(onSaveShapes);
    expect(saved).toMatchObject({ kind: 'rectangle' });
    expect(saved.x).toBeCloseTo(0.2);
    expect(saved.y).toBeCloseTo(0.3);
    expect(saved.width).toBeCloseTo(0.4);
    expect(saved.height).toBeCloseTo(0.4);
  });

  it('draws an ellipse the same way', () => {
    const { onSaveShapes } = renderAnnotation();
    sizeStage();
    pickTool('Ellipse');

    pointer('pointerdown', 10, 10);
    pointer('pointermove', 50, 40);
    pointer('pointerup', 50, 40);

    const [saved] = savedShapes(onSaveShapes);
    expect(saved).toMatchObject({ kind: 'ellipse' });
    expect(saved.width).toBeCloseTo(0.4);
    expect(saved.height).toBeCloseTo(0.3);
  });

  it('draws an arrow from the press to the release', () => {
    const { onSaveShapes } = renderAnnotation();
    sizeStage();
    pickTool('Arrow');

    pointer('pointerdown', 10, 20);
    pointer('pointermove', 70, 80);
    pointer('pointerup', 70, 80);

    const [saved] = savedShapes(onSaveShapes);
    expect(saved.kind).toBe('arrow');
    expect(saved.points).toHaveLength(2);
    expect(saved.points[0].x).toBeCloseTo(0.1);
    expect(saved.points[1].y).toBeCloseTo(0.8);
  });

  it('keeps every point of a freehand stroke', () => {
    const { onSaveShapes } = renderAnnotation();
    sizeStage();
    pickTool('Freehand');

    pointer('pointerdown', 10, 10);
    pointer('pointermove', 30, 20);
    pointer('pointermove', 50, 60);
    pointer('pointerup', 50, 60);

    const [saved] = savedShapes(onSaveShapes);
    expect(saved.kind).toBe('freehand');
    expect(saved.points.length).toBeGreaterThanOrEqual(3);
  });

  it('drops a click that draws nothing', () => {
    renderAnnotation();
    sizeStage();
    pickTool('Rectangle');

    pointer('pointerdown', 40, 40);
    pointer('pointerup', 40, 40);

    expect(
      screen.getByText('Pick a tool, then draw on the image.'),
    ).toBeTruthy();
  });

  it('drops an arrow with no length', () => {
    renderAnnotation();
    sizeStage();
    pickTool('Arrow');

    pointer('pointerdown', 40, 40);
    pointer('pointerup', 40, 40);

    expect(
      screen.getByText('Pick a tool, then draw on the image.'),
    ).toBeTruthy();
  });

  it('places a text box where the stage is clicked', () => {
    renderAnnotation();
    sizeStage();
    pickTool('Text');

    pointer('pointerdown', 25, 75);

    expect(screen.getByRole('alert')).toHaveTextContent('Text 1 is empty');
  });

  it('moves a shape by dragging it with the select tool', () => {
    const { onSaveShapes } = renderAnnotation();
    sizeStage();
    pickTool('Rectangle');
    pointer('pointerdown', 20, 20);
    pointer('pointermove', 40, 40);
    pointer('pointerup', 40, 40);
    pickTool('Select and move');

    const shape = stage().querySelector('[data-item]') as Element;
    pointer('pointerdown', 30, 30, shape);
    pointer('pointermove', 50, 60);
    pointer('pointerup', 50, 60);

    const [saved] = savedShapes(onSaveShapes);
    expect(saved.x).toBeCloseTo(0.4);
    expect(saved.y).toBeCloseTo(0.5);
  });

  it('deselects when empty canvas is pressed with the select tool', () => {
    renderAnnotation();
    sizeStage();
    pickTool('Rectangle');
    pointer('pointerdown', 20, 20);
    pointer('pointermove', 40, 40);
    pointer('pointerup', 40, 40);
    pickTool('Select and move');

    pointer('pointerdown', 90, 90);

    expect(screen.getByRole('button', { name: 'Rectangle 1' })).toBeTruthy();
  });
});

describe('GeometryEditorDialog trajectory pointer', () => {
  it('adds a point where the stage is clicked and drags it', () => {
    const { onSavePoints } = renderTrajectory();
    sizeStage();

    pointer('pointerdown', 10, 10);
    pointer('pointerdown', 60, 60);
    const second = stage().querySelector('[data-item]:last-of-type');
    expect(second).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save trajectory' }));
    const saved = onSavePoints.mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(saved[1].x).toBeCloseTo(0.6);
    expect(saved[1].y).toBeCloseTo(0.6);
  });

  it('moves a point by dragging it', () => {
    const { onSavePoints } = renderTrajectory();
    sizeStage();
    pointer('pointerdown', 10, 10);
    pointer('pointerdown', 60, 60);

    const items = stage().querySelectorAll('[data-item]');
    pointer('pointerdown', 60, 60, items[items.length - 1]);
    pointer('pointermove', 80, 90);
    pointer('pointerup', 80, 90);

    fireEvent.click(screen.getByRole('button', { name: 'Save trajectory' }));
    const saved = onSavePoints.mock.calls[0][0];
    expect(saved[saved.length - 1].x).toBeCloseTo(0.8);
    expect(saved[saved.length - 1].y).toBeCloseTo(0.9);
  });
});

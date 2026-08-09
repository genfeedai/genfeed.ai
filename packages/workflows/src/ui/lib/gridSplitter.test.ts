import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGridForDimensions,
  detectAndSplitGrid,
  detectGrid,
  detectGridWithDimensions,
  getGridCandidates,
  splitImage,
  splitWithDimensions,
} from './gridSplitter';

interface FakeContext2D {
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
}

/** Builds a white image with black grid lines splitting it rows x cols. */
function makeGridImageData(
  width: number,
  height: number,
  rows: number,
  cols: number,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);

  const paint = (x: number, y: number): void => {
    const idx = (y * width + x) * 4;
    data[idx] = 0;
    data[idx + 1] = 0;
    data[idx + 2] = 0;
  };

  for (let c = 1; c < cols; c++) {
    const x = Math.round((width / cols) * c);
    for (let y = 0; y < height; y++) paint(x, y);
  }
  for (let r = 1; r < rows; r++) {
    const y = Math.round((height / rows) * r);
    for (let x = 0; x < width; x++) paint(x, y);
  }

  return { data, height, width } as ImageData;
}

function stubImage(width: number, height: number, fail = false): void {
  class StubImage {
    crossOrigin: string | null = null;
    height = 0;
    width = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => {
        if (fail) {
          this.onerror?.();
          return;
        }
        this.width = width;
        this.height = height;
        this.onload?.();
      });
    }
  }
  vi.stubGlobal('Image', StubImage);
}

function stubCanvas(options: {
  imageData?: ImageData;
  nullContext?: boolean;
}): FakeContext2D {
  const ctx: FakeContext2D = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => options.imageData),
  };

  let cellCounter = 0;
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName !== 'canvas') return realCreateElement(tagName);
    const canvas = {
      getContext: () => (options.nullContext ? null : ctx),
      height: 0,
      toDataURL: () => `data:image/png;base64,cell-${cellCounter++}`,
      width: 0,
    };
    return canvas as unknown as HTMLCanvasElement;
  });

  return ctx;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createGridForDimensions', () => {
  it('creates row-major cells with rounded dimensions', () => {
    const grid = createGridForDimensions(100, 60, 2, 2);

    expect(grid.rows).toBe(2);
    expect(grid.cols).toBe(2);
    expect(grid.confidence).toBe(1);
    expect(grid.cells).toHaveLength(4);
    expect(grid.cells[0]).toEqual({ height: 30, width: 50, x: 0, y: 0 });
    expect(grid.cells[1]).toEqual({ height: 30, width: 50, x: 50, y: 0 });
    expect(grid.cells[2]).toEqual({ height: 30, width: 50, x: 0, y: 30 });
    expect(grid.cells[3]).toEqual({ height: 30, width: 50, x: 50, y: 30 });
  });

  it('handles non-even divisions by rounding', () => {
    const grid = createGridForDimensions(100, 100, 3, 3);
    expect(grid.cells).toHaveLength(9);
    expect(grid.cells[4].x).toBe(33);
    expect(grid.cells[4].y).toBe(33);
  });
});

describe('getGridCandidates', () => {
  it('never proposes a 1x1 grid', () => {
    const candidates = getGridCandidates(600, 600);
    expect(candidates.some((c) => c.rows === 1 && c.cols === 1)).toBe(false);
  });

  it('returns candidates sorted by score descending', () => {
    const candidates = getGridCandidates(800, 600);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(
        candidates[i].score,
      );
    }
  });

  it('proposes all rows/cols combinations up to 6x6', () => {
    expect(getGridCandidates(600, 600)).toHaveLength(35);
  });

  it('favors symmetric square grids for square images', () => {
    const [best] = getGridCandidates(1000, 1000);
    expect(best.rows).toBe(best.cols);
  });
});

describe('detectGridWithDimensions', () => {
  it('resolves a grid using the loaded image size', async () => {
    stubImage(200, 100);
    const grid = await detectGridWithDimensions(
      'data:image/png;base64,x',
      2,
      4,
    );
    expect(grid.rows).toBe(2);
    expect(grid.cols).toBe(4);
    expect(grid.cells).toHaveLength(8);
    expect(grid.cells[1].x).toBe(50);
  });

  it('rejects when the image fails to load', async () => {
    stubImage(0, 0, true);
    await expect(detectGridWithDimensions('bad', 2, 2)).rejects.toThrow(
      'Failed to load image',
    );
  });
});

describe('detectGrid', () => {
  it('detects a 2x2 grid from strong dividing edges', async () => {
    const size = 64;
    stubImage(size, size);
    stubCanvas({ imageData: makeGridImageData(size, size, 2, 2) });

    const grid = await detectGrid('data:image/png;base64,grid');
    expect(grid.rows).toBe(2);
    expect(grid.cols).toBe(2);
    expect(grid.cells).toHaveLength(4);
  });

  it('rejects when the canvas context is unavailable', async () => {
    stubImage(64, 64);
    stubCanvas({ nullContext: true });

    await expect(detectGrid('data:image/png;base64,x')).rejects.toThrow(
      'Could not get canvas context',
    );
  });

  it('rejects when the image fails to load', async () => {
    stubImage(0, 0, true);
    await expect(detectGrid('bad')).rejects.toThrow('Failed to load image');
  });
});

describe('splitImage', () => {
  it('renders one data URL per cell', async () => {
    stubImage(100, 100);
    const ctx = stubCanvas({});
    const grid = createGridForDimensions(100, 100, 2, 2);

    const images = await splitImage('data:image/png;base64,x', grid);
    expect(images).toHaveLength(4);
    expect(images[0]).toBe('data:image/png;base64,cell-0');
    expect(ctx.drawImage).toHaveBeenCalledTimes(4);
  });

  it('rejects when the canvas context is unavailable', async () => {
    stubImage(100, 100);
    stubCanvas({ nullContext: true });
    const grid = createGridForDimensions(100, 100, 2, 2);

    await expect(splitImage('data:image/png;base64,x', grid)).rejects.toThrow(
      'Could not get canvas context',
    );
  });

  it('rejects when the image fails to load', async () => {
    stubImage(0, 0, true);
    const grid = createGridForDimensions(100, 100, 2, 2);
    await expect(splitImage('bad', grid)).rejects.toThrow(
      'Failed to load image',
    );
  });
});

describe('detectAndSplitGrid', () => {
  it('detects then splits in one call', async () => {
    const size = 64;
    stubImage(size, size);
    stubCanvas({ imageData: makeGridImageData(size, size, 2, 2) });

    const { grid, images } = await detectAndSplitGrid(
      'data:image/png;base64,grid',
    );
    expect(grid.rows).toBe(2);
    expect(grid.cols).toBe(2);
    expect(images).toHaveLength(4);
  });
});

describe('splitWithDimensions', () => {
  it('splits using explicit rows and cols', async () => {
    stubImage(90, 90);
    stubCanvas({});

    const { grid, images } = await splitWithDimensions(
      'data:image/png;base64,x',
      3,
      1,
    );
    expect(grid.rows).toBe(3);
    expect(grid.cols).toBe(1);
    expect(images).toHaveLength(3);
  });
});

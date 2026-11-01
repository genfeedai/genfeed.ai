import { describe, expect, it } from 'vitest';
import { findOverlayViolations } from './check-modal-standard-usage';

const WEB_FILE = '/repo/apps/web/src/Thing.tsx';

describe('findOverlayViolations', () => {
  it.each([
    ['fixed scrim', '<div className="fixed inset-0 z-40 bg-black/60" />'],
    [
      'reordered classes',
      "<div className={cn('inset-0 z-50 flex fixed', className)} />",
    ],
    ['side panel', '<aside className="fixed inset-y-0 right-0 w-96" />'],
    [
      'loading veil',
      '<div className="absolute inset-0 flex bg-background/70 backdrop-blur-sm" />',
    ],
  ])('flags a hand-built %s', (_name, source) => {
    expect(findOverlayViolations(WEB_FILE, source)).toHaveLength(1);
  });

  it.each([
    [
      'decorative background',
      '<div className="pointer-events-none fixed inset-0 bg-dots" />',
    ],
    ['media hover scrim', '<div className="absolute inset-0 bg-black/50" />'],
    ['floating panel', '<div className="fixed bottom-4 right-4 z-50" />'],
  ])('allows a %s', (_name, source) => {
    expect(findOverlayViolations(WEB_FILE, source)).toEqual([]);
  });

  it('allows the shared UI package to own overlays', () => {
    expect(
      findOverlayViolations(
        '/repo/packages/ui/src/primitives/dialog.tsx',
        '<div className="fixed inset-0 z-50 bg-black/70" />',
      ),
    ).toEqual([]);
  });

  it('honours an allow comment that states a reason, on the line or above', () => {
    const sameLine = `<div className="fixed inset-0" /> {/* ui-guard-allow:overlay -- full-page error */}`;
    const lineAbove = [
      '// ui-guard-allow:overlay -- full-page error',
      '<div className="fixed inset-0" />',
    ].join('\n');

    expect(findOverlayViolations(WEB_FILE, sameLine)).toEqual([]);
    expect(findOverlayViolations(WEB_FILE, lineAbove)).toEqual([]);
  });

  it('rejects an allow comment without a reason', () => {
    expect(
      findOverlayViolations(
        WEB_FILE,
        '<div className="fixed inset-0" /> {/* ui-guard-allow:overlay */}',
      ),
    ).toHaveLength(1);
  });

  it('reports the 1-based line of the violation', () => {
    const [violation] = findOverlayViolations(
      WEB_FILE,
      ['const a = 1;', '<div className="fixed inset-0" />'].join('\n'),
    );

    expect(violation?.line).toBe(2);
  });
});

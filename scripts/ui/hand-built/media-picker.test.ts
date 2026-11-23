import { describe, expect, it } from 'vitest';
import {
  parseSourceFile,
  scriptKindFor,
} from '../../architecture/parse-source-file';
import area from './areas/media-picker';
import type { HandBuiltSource } from './core';

function rulesFor(file: string, text: string): string[] {
  const source: HandBuiltSource = {
    file,
    sourceFile: parseSourceFile(file, text, scriptKindFor(file)),
    text,
  };
  return area.scan(source).map((finding) => finding.rule);
}

const GRID = `export default function A(){return <div className="grid grid-cols-3 gap-2" />;}`;

describe('media-picker guard', () => {
  it('blocks a hand-written grid in a picker file', () => {
    expect(rulesFor('apps/web/src/IngredientPickerCard.tsx', GRID)).toEqual([
      'media-picker-grid',
    ]);
    expect(
      rulesFor(
        'apps/web/src/components/modals/gallery/ModalGalleryContent.tsx',
        `export default function A(){return <div className="sm:columns-2" />;}`,
      ),
    ).toEqual(['media-picker-grid']);
  });

  it('lets other files, the shared package and non-grid pickers through', () => {
    expect(rulesFor('apps/web/src/Dashboard.tsx', GRID)).toEqual([]);
    expect(
      rulesFor(
        'packages/ui/src/components/content/library-picker/LibraryGrid.tsx',
        GRID,
      ),
    ).toEqual([]);
    expect(
      rulesFor(
        'apps/web/src/LibraryPicker.tsx',
        `export default function A(){return <div className="flex gap-2" />;}`,
      ),
    ).toEqual([]);
  });

  it('honours the escape hatch with a reason', () => {
    expect(
      rulesFor(
        'apps/web/src/ReferencePicker.tsx',
        [
          'export default function A(){return (',
          '  // ui-guard-allow:media-picker-grid -- brand references, not Library media',
          '  <div className="grid grid-cols-3" />',
          ');}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

import type { HandBuiltArea } from '../core';
import { classUtilities, finding, SHARED_PACKAGE, walkJsx } from '../jsx';

/**
 * A media picker shows the Library grid. `LibraryGrid` and `LibraryPicker`
 * (`@ui/content/library-picker/*`) are the one place that lays Library media
 * out; a picker or gallery file lists it through them instead of with its own
 * `grid-cols-*` or `columns-*`. A file is a media picker when its name says
 * Picker or ModalGallery (the post modal's asset picker). A grid of something that is not Library media (brand
 * references, tracks) takes `ui-guard-allow:media-picker-grid -- <reason>`.
 */
const MEDIA_PICKER_FILE = /(Picker|ModalGallery)[^/]*\.tsx$/;
const HAND_WRITTEN_GRID = /^(grid-cols|columns)-/;

const area: HandBuiltArea = {
  id: 'media-picker',
  scan: (source) => {
    if (
      SHARED_PACKAGE.test(source.file) ||
      !MEDIA_PICKER_FILE.test(source.file)
    ) {
      return [];
    }
    const findings: ReturnType<HandBuiltArea['scan']> = [];
    walkJsx(source, (tag, _children, constants) => {
      for (const utility of classUtilities(source, tag, constants)) {
        if (HAND_WRITTEN_GRID.test(utility)) {
          findings.push(
            ...finding(
              source,
              tag,
              'media-picker-grid',
              `${utility} in a media picker. List assets with LibraryGrid or LibraryPicker (@ui/content/library-picker); for something that is not Library media, add ui-guard-allow:media-picker-grid -- <reason>.`,
            ),
          );
          break;
        }
      }
    });
    return findings;
  },
};

export default area;

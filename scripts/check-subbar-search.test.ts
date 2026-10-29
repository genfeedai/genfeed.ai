import { describe, expect, it } from 'vitest';
import {
  findSubbarSearchViolations,
  SUBBAR_SEARCH_ALLOWLIST,
} from './check-subbar-search';

const RAW_SEARCH = "import FormSearchbar from '@ui/primitives/searchbar';";
const SHARED_SEARCH =
  "import SearchField from '@ui/content/search-field/SearchField';";

describe('findSubbarSearchViolations', () => {
  it('flags a list page that imports the raw Searchbar', () => {
    expect(
      findSubbarSearchViolations(
        'packages/pages/posts/list/posts-list.tsx',
        ['import x from "y";', RAW_SEARCH].join('\n'),
      ),
    ).toEqual([{ file: 'packages/pages/posts/list/posts-list.tsx', line: 2 }]);
  });

  it('accepts the shared SearchField', () => {
    expect(
      findSubbarSearchViolations(
        'packages/pages/posts/list/posts-list.tsx',
        SHARED_SEARCH,
      ),
    ).toEqual([]);
  });

  it('leaves the modal searches on the allowlist alone', () => {
    for (const file of SUBBAR_SEARCH_ALLOWLIST) {
      expect(findSubbarSearchViolations(file, RAW_SEARCH)).toEqual([]);
    }
  });
});

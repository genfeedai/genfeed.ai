import type {
  LibraryElementKind,
  LibraryElementType,
} from '../../enums/library-element.enum';
import type { PersonaAvailabilityMode } from '../../enums/persona.enum';

/** One row of the References list: a character or a Library element. */
export interface LibraryElementListItem {
  availabilityMode: PersonaAvailabilityMode;
  availableBrandIds: string[];
  /** First reference file, shown as the cover. */
  coverIngredientId: string | null;
  description: string | null;
  handle: string | null;
  id: string;
  kind: LibraryElementKind;
  label: string;
  owningBrandId: string | null;
  /** Every live reference file, cover first. */
  referenceIngredientIds: string[];
  updatedAt: string;
}

export interface CreateLibraryElementInput {
  availability?: {
    brandIds?: string[];
    mode: PersonaAvailabilityMode;
  };
  description?: string;
  handle: string;
  label: string;
  /** Library assets linked as reference files, in order. The first is the cover. */
  referenceIngredientIds?: string[];
  type: LibraryElementType;
}

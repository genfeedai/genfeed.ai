import type { CreateLibraryElementInput } from '@genfeedai/contracts/interfaces';
import type {
  LibraryElement,
  UpdateLibraryElementInput,
} from '@services/content/library-elements.service';

export interface ElementDialogProps {
  /** The element being edited; absent when creating a new one. */
  element?: LibraryElement;
  isBusy: boolean;
  onClose: () => void;
  onCreate: (input: CreateLibraryElementInput) => Promise<boolean>;
  onUpdate: (id: string, input: UpdateLibraryElementInput) => Promise<boolean>;
}

export interface ElementsTableProps {
  elements: LibraryElement[];
  isLoading: boolean;
  onCreate?: () => void;
  onEdit: (element: LibraryElement) => void;
  onRemove: (element: LibraryElement) => void;
}

export interface LibraryElementsControls {
  create: (input: CreateLibraryElementInput) => Promise<boolean>;
  elements: LibraryElement[];
  isBusy: boolean;
  isLoading: boolean;
  remove: (element: LibraryElement) => Promise<void>;
  update: (id: string, input: UpdateLibraryElementInput) => Promise<boolean>;
}

import type { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type {
  BrandCharacterCandidate,
  BrandCharacterListItem,
  BrandCharacterSheetStep,
} from '@genfeedai/contracts/interfaces';

export interface CharacterBrandOption {
  id: string;
  label: string;
}

export interface CharacterAvailabilityDraft {
  brandIds: string[];
  mode: PersonaAvailabilityMode;
}

export interface CharacterAvailabilityFieldsProps {
  brands: CharacterBrandOption[];
  draft: CharacterAvailabilityDraft;
  isDisabled?: boolean;
  onChange: (draft: CharacterAvailabilityDraft) => void;
  owningBrandId: string;
}

export interface CharacterAvailabilityControls {
  character: BrandCharacterListItem | null;
  close: () => void;
  draft: CharacterAvailabilityDraft;
  isSaving: boolean;
  open: (character: BrandCharacterListItem) => void;
  save: () => Promise<void>;
  setDraft: (draft: CharacterAvailabilityDraft) => void;
}

export interface CharactersPageState {
  approve: {
    availability: CharacterAvailabilityDraft;
    handle: string;
    setAvailability: (draft: CharacterAvailabilityDraft) => void;
    label: string;
    setHandle: (value: string) => void;
    setLabel: (value: string) => void;
  };
  availabilityControls: CharacterAvailabilityControls;
  brandId: string;
  brands: CharacterBrandOption[];
  candidate: BrandCharacterCandidate | null;
  canManageSharing: boolean;
  characters: BrandCharacterListItem[];
  create: {
    description: string;
    isNonHumanoid: boolean;
    seed: string;
    setDescription: (value: string) => void;
    setIsNonHumanoid: (value: boolean) => void;
    setSeed: (value: string) => void;
  };
  discardCandidate: () => void;
  approveCandidate: () => void;
  createCharacter: () => Promise<void>;
  generateSheet: () => Promise<void>;
  isCreateDialogOpen: boolean;
  isCreating: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  openCreateDialog: () => void;
  setIsCreateDialogOpen: (isOpen: boolean) => void;
  step: BrandCharacterSheetStep;
}

export interface CharactersTableProps {
  canManageSharing: boolean;
  characters: BrandCharacterListItem[];
  isLoading: boolean;
  onCreate: () => void;
  onManageAvailability: (character: BrandCharacterListItem) => void;
}

export interface CharacterAvailabilityDialogProps {
  brands: CharacterBrandOption[];
  controls: CharacterAvailabilityControls;
}

export interface CharacterCreateDialogProps {
  approve: CharactersPageState['approve'];
  brandId: string;
  brands: CharacterBrandOption[];
  canManageSharing: boolean;
  candidate: BrandCharacterCandidate | null;
  create: CharactersPageState['create'];
  discardCandidate: () => void;
  approveCandidate: () => void;
  createCharacter: () => Promise<void>;
  generateSheet: () => Promise<void>;
  isCreating: boolean;
  isGenerating: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  step: BrandCharacterSheetStep;
}

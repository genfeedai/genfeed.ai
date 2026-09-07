import type {
  BrandCharacterCandidate,
  BrandCharacterListItem,
  BrandCharacterSheetStep,
} from '@genfeedai/contracts/interfaces';

export interface CharactersPageState {
  approve: {
    handle: string;
    label: string;
    setHandle: (value: string) => void;
    setLabel: (value: string) => void;
  };
  candidate: BrandCharacterCandidate | null;
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
  characters: BrandCharacterListItem[];
  isLoading: boolean;
  onCreate: () => void;
}

export interface CharacterCreateDialogProps {
  approve: CharactersPageState['approve'];
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

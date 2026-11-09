import type {
  CharacterSheetWizardAction,
  CharacterSheetWizardState,
} from '@/props/characters/characters-page.props';

export const INITIAL_CHARACTER_SHEET_WIZARD: CharacterSheetWizardState = {
  candidate: null,
  isCreating: false,
  isGenerating: false,
  step: 'describe',
};

/**
 * The character sheet wizard as one reducer (#9744). A generated sheet moves
 * the wizard to `candidate`; approving it moves to `approve`, where the
 * character is created; discarding returns to `describe`.
 */
export function characterSheetWizardReducer(
  state: CharacterSheetWizardState,
  action: CharacterSheetWizardAction,
): CharacterSheetWizardState {
  switch (action.type) {
    case 'generate_started':
      return { ...state, isGenerating: true };
    case 'generate_succeeded':
      return {
        ...state,
        candidate: action.candidate,
        isGenerating: false,
        step: 'candidate',
      };
    case 'generate_failed':
      return { ...state, isGenerating: false };
    case 'discarded':
      return {
        ...state,
        candidate: null,
        isGenerating: false,
        step: 'describe',
      };
    case 'approved':
      return state.candidate ? { ...state, step: 'approve' } : state;
    case 'create_started':
      return { ...state, isCreating: true };
    case 'create_settled':
      return { ...state, isCreating: false };
  }
}

/**
 * Undo history for the geometry editors: one reducer for shapes and for path points. A drag or a
 * burst of typing is one history entry (`checkpoint`, then `live` edits), so one undo reverts it.
 */
export interface GeometryHistoryState<TItem> {
  history: TItem[][];
  items: TItem[];
  selectedId: string | null;
}

export type GeometryHistoryAction<TItem> =
  | { items: TItem[]; selectedId?: string | null; type: 'commit' }
  | { items: TItem[]; type: 'live' }
  | { id: string | null; type: 'select' }
  | { type: 'undo' }
  | { type: 'clear' }
  | { type: 'checkpoint' };

export function createGeometryHistory<TItem>(
  items: TItem[],
): GeometryHistoryState<TItem> {
  return { history: [], items, selectedId: null };
}

export function geometryHistoryReducer<TItem>(
  state: GeometryHistoryState<TItem>,
  action: GeometryHistoryAction<TItem>,
): GeometryHistoryState<TItem> {
  switch (action.type) {
    case 'commit':
      return {
        history: [...state.history, state.items],
        items: action.items,
        selectedId:
          action.selectedId === undefined
            ? state.selectedId
            : action.selectedId,
      };
    case 'checkpoint':
      return { ...state, history: [...state.history, state.items] };
    case 'live':
      return { ...state, items: action.items };
    case 'select':
      return { ...state, selectedId: action.id };
    case 'clear':
      return state.items.length === 0
        ? state
        : {
            history: [...state.history, state.items],
            items: [],
            selectedId: null,
          };
    case 'undo': {
      const previous = state.history[state.history.length - 1];
      if (!previous) return state;
      return {
        history: state.history.slice(0, -1),
        items: previous,
        selectedId: null,
      };
    }
    default:
      return state;
  }
}

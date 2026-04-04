// =============================================================================
// ACTION TYPES
// =============================================================================

export type ActionCategory = 'crud' | 'ai' | 'data' | 'validation';

export type CrudAction = 'add' | 'duplicate' | 'delete' | 'reorder';
export type AIAction = 'enhance' | 'generate' | 'suggest';
export type DataAction = 'copy' | 'paste' | 'import' | 'export';
export type ValidationAction = 'validate' | 'autofill' | 'reset';

export type InputGroupActionType =
  | CrudAction
  | AIAction
  | DataAction
  | ValidationAction;

export interface ActionConfig<TIcon = unknown> {
  id: string;
  type: InputGroupActionType;
  category: ActionCategory;
  label: string;
  icon: TIcon;
  shortcut?: string;
  disabled?: boolean;
  hidden?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export type ActionUIPattern =
  | 'hover-toolbar'
  | 'context-menu'
  | 'inline-buttons'
  | 'dropdown-menu';

// =============================================================================
// INPUT GROUP PROPS
// =============================================================================

export type InputGroupVariant = 'section' | 'inline' | 'card' | 'minimal';

export interface InputGroupProps<TChildren = unknown, TIcon = unknown> {
  /** Unique identifier for the group */
  id: string;

  /** Group title displayed in header */
  title?: string;

  /** Optional description text */
  description?: string;

  /** Visual variant */
  variant?: InputGroupVariant;

  /** Whether the group is collapsible */
  collapsible?: boolean;

  /** Initial collapsed state */
  defaultCollapsed?: boolean;

  /** Whether the group is in edit mode (inline editing) */
  isEditing?: boolean;

  /** Actions available at the group level */
  actions?: ActionConfig<TIcon>[];

  /** How to display actions */
  actionPattern?: ActionUIPattern;

  /** Whether the entire group is disabled */
  disabled?: boolean;

  /** Whether the group is in loading state */
  loading?: boolean;

  /** Error message for the group */
  error?: string;

  /** Callback when edit mode changes */
  onEditChange?: (isEditing: boolean) => void;

  /** Callback when group is collapsed/expanded */
  onCollapseChange?: (collapsed: boolean) => void;

  /** Children - InputGroupField or InputGroupRow components */
  children: TChildren;

  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// INPUT GROUP HEADER PROPS
// =============================================================================

export interface InputGroupHeaderProps<TIcon = unknown> {
  title: string;
  description?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapseToggle?: () => void;
  actions?: ActionConfig<TIcon>[];
  actionPattern?: ActionUIPattern;
  isEditing?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  className?: string;
}

// =============================================================================
// INPUT GROUP FIELD PROPS
// =============================================================================

export type FieldWidth = 'full' | 'half' | 'third' | 'quarter' | 'auto';

export interface InputGroupFieldProps<TChildren = unknown, TIcon = unknown> {
  /** Unique identifier */
  id: string;

  /** Field label */
  label?: string;

  /** Helper text below the field */
  helperText?: string;

  /** Whether field is required */
  required?: boolean;

  /** Validation error */
  error?: string;

  /** Actions for this specific field */
  actions?: ActionConfig<TIcon>[];

  /** How to display field-level actions */
  actionPattern?: ActionUIPattern;

  /** Whether field is disabled */
  disabled?: boolean;

  /** The actual input component */
  children: TChildren;

  /** Layout width */
  width?: FieldWidth;

  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// INPUT GROUP ROW PROPS
// =============================================================================

export interface InputGroupRowProps<
  T = Record<string, unknown>,
  TChildren = unknown,
  TIcon = unknown,
> {
  /** Row index in the list */
  index: number;

  /** Row data */
  data: T;

  /** Whether this row is being dragged */
  isDragging?: boolean;

  /** Whether rows can be reordered */
  sortable?: boolean;

  /** Actions available for this row */
  actions?: ActionConfig<TIcon>[];

  /** How to display row actions */
  actionPattern?: ActionUIPattern;

  /** Callback when data changes */
  onChange: (data: T) => void;

  /** Callback to delete this row */
  onDelete?: () => void;

  /** Callback to duplicate this row */
  onDuplicate?: () => void;

  /** The row content */
  children: TChildren;

  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// DYNAMIC LIST PROPS
// =============================================================================

export interface RowHelpers<T> {
  update: (data: Partial<T>) => void;
  remove: () => void;
  duplicate: () => void;
  moveUp: () => void;
  moveDown: () => void;
}

export interface DynamicListProps<
  T = Record<string, unknown>,
  TIcon = unknown,
> {
  /** List of items */
  items: T[];

  /** Minimum number of items */
  minItems?: number;

  /** Maximum number of items */
  maxItems?: number;

  /** Whether items can be reordered */
  sortable?: boolean;

  /** Default value for new items */
  defaultItem: T;

  /** Callback when items change */
  onChange: (items: T[]) => void;

  /** Render function for each row */
  renderRow: (item: T, index: number, helpers: RowHelpers<T>) => unknown;

  /** Add button label */
  addButtonLabel?: string;

  /** Empty state message */
  emptyMessage?: string;

  /** Group-level actions */
  actions?: ActionConfig<TIcon>[];

  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// ACTION TOOLBAR PROPS
// =============================================================================

export type ToolbarSize = 'sm' | 'md' | 'lg';
export type ToolbarOrientation = 'horizontal' | 'vertical';
export type ToolbarVisibility = boolean | 'hover';

export interface ActionToolbarProps<TIcon = unknown> {
  actions: ActionConfig<TIcon>[];
  size?: ToolbarSize;
  orientation?: ToolbarOrientation;
  visible?: ToolbarVisibility;
  className?: string;
}

// =============================================================================
// ACTION MENU PROPS
// =============================================================================

export type MenuAlign = 'start' | 'center' | 'end';
export type MenuSide = 'top' | 'right' | 'bottom' | 'left';

export interface ActionMenuProps<TIcon = unknown, TTriggerIcon = unknown> {
  actions: ActionConfig<TIcon>[];
  triggerIcon?: TTriggerIcon;
  triggerLabel?: string;
  align?: MenuAlign;
  side?: MenuSide;
  className?: string;
}

// =============================================================================
// COMPOSITE INPUT TYPES
// =============================================================================

export interface DimensionsValue {
  width: number;
  height: number;
  unit?: 'px' | 'em' | 'rem' | '%' | 'vw' | 'vh';
}

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
}

// =============================================================================
// COMPOSITE INPUT PROPS
// =============================================================================

export interface DimensionsGroupProps {
  value: DimensionsValue;
  onChange: (value: DimensionsValue) => void;
  disabled?: boolean;
  error?: string;
  showUnit?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}

export interface KeyValueListProps {
  items: KeyValuePair[];
  onChange: (items: KeyValuePair[]) => void;
  disabled?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addButtonLabel?: string;
  minItems?: number;
  maxItems?: number;
  className?: string;
}

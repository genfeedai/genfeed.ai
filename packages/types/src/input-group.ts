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
  id: string;

  title?: string;

  description?: string;

  variant?: InputGroupVariant;

  collapsible?: boolean;

  defaultCollapsed?: boolean;

  isEditing?: boolean;

  actions?: ActionConfig<TIcon>[];

  actionPattern?: ActionUIPattern;

  disabled?: boolean;

  loading?: boolean;

  error?: string;

  onEditChange?: (isEditing: boolean) => void;

  onCollapseChange?: (collapsed: boolean) => void;

  /** InputGroupField or InputGroupRow components. */
  children: TChildren;

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
  id: string;

  label?: string;

  helperText?: string;

  required?: boolean;

  error?: string;

  actions?: ActionConfig<TIcon>[];

  actionPattern?: ActionUIPattern;

  disabled?: boolean;

  children: TChildren;

  width?: FieldWidth;

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
  index: number;

  data: T;

  isDragging?: boolean;

  sortable?: boolean;

  actions?: ActionConfig<TIcon>[];

  actionPattern?: ActionUIPattern;

  onChange: (data: T) => void;

  onDelete?: () => void;

  onDuplicate?: () => void;

  children: TChildren;

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
  items: T[];

  minItems?: number;

  maxItems?: number;

  sortable?: boolean;

  defaultItem: T;

  onChange: (items: T[]) => void;

  renderRow: (item: T, index: number, helpers: RowHelpers<T>) => unknown;

  addButtonLabel?: string;

  emptyMessage?: string;

  actions?: ActionConfig<TIcon>[];

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

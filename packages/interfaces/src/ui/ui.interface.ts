import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from 'react';
import type { IconType } from 'react-icons';

export interface IBaseComponentProps {
  className?: string;
  id?: string;
  testId?: string;
  style?: CSSProperties;
}

export interface IInteractiveComponentProps extends IBaseComponentProps {
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e: MouseEvent) => void;
}

export interface IModalProps<T = unknown> extends IBaseComponentProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  data?: T;
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  showCloseButton?: boolean;
}

export interface IButtonProps extends IInteractiveComponentProps {
  label: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconType | ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

export interface IInputProps extends IBaseComponentProps {
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url';
  disabled?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
  autoFocus?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}

export interface ISelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  icon?: IconType | string;
}

export interface ISelectProps extends IBaseComponentProps {
  value: string | number | string[] | number[];
  onChange: (value: string | number | string[] | number[]) => void;
  options: ISelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
  multiple?: boolean;
  searchable?: boolean;
}

export interface ITab {
  id: string;
  label: string;
  icon?: IconType;
  href?: string;
  disabled?: boolean;
  badge?: string | number;
  content?: ReactNode;
}

export interface ITabsProps extends IBaseComponentProps {
  tabs: ITab[];
  activeTab?: string;
  onChange?: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export interface ILoadingProps extends IBaseComponentProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  fullScreen?: boolean;
  variant?: 'spinner' | 'dots' | 'bars';
}

export interface IEmptyStateProps extends IBaseComponentProps {
  title?: string;
  description?: string;
  icon?: IconType | ReactNode;
  action?: ReactNode;
}

export interface IPaginationProps extends IBaseComponentProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showFirstLast?: boolean;
  showPageNumbers?: boolean;
  maxPageNumbers?: number;
}

export interface ITooltipProps extends IBaseComponentProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  trigger?: 'hover' | 'click' | 'focus';
}

export interface ICardProps extends IBaseComponentProps {
  title?: string;
  description?: string;
  image?: string;
  footer?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'bordered' | 'shadow';
}

export interface IFormFieldProps extends IBaseComponentProps {
  label?: string;
  error?: string;
  required?: boolean;
  help?: string;
  children: ReactNode;
}

export interface IContainerProps extends IBaseComponentProps {
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  center?: boolean;
}

export interface IActionState {
  isLoading: boolean;
  error?: string | null;
  success?: boolean;
}

export interface IPosition {
  x: number;
  y: number;
}

export interface IDimensions {
  width: number;
  height: number;
}

export interface IRect extends IPosition, IDimensions {}

export interface IDropdownPosition {
  top: number;
  left: number;
}

export interface IVisibleRange {
  start: number;
  end: number;
}

export interface IStudioActionStates {
  isPublishing: boolean;
  isUpscaling: boolean;
  isDeleting: boolean;
  isCloning: boolean;
  isReversing: boolean;
  isMirroring: boolean;
  isPortraiting: boolean;
  isLandscaping: boolean;
  isSquaring: boolean;
  isSlowingDown: boolean;
  isSpeedingUp: boolean;
  isAnimating: boolean;
  isLooping: boolean;
  isRemoving: boolean;
  isRefining: boolean;
  isExporting: boolean;
  isEnhancing: boolean;
  isConverting: boolean;
}

export interface IImageActionStates {
  isPublishing: boolean;
  isUpscaling: boolean;
  isDeleting: boolean;
  isCloning: boolean;
  isEnhancing: boolean;
}

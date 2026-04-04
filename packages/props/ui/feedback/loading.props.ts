/**
 * Base loading component props
 */
export interface LoadingProps {
  isFullSize?: boolean;
  message?: string;
  className?: string;
}

/**
 * Loading overlay props extending base LoadingProps
 */
export interface LoadingOverlayProps extends LoadingProps {}

/**
 * Loading states for tracking multiple async operations
 */
export interface LoadingStates {
  isPublishing?: boolean;
  isUpscaling?: boolean;
  isDeleting?: boolean;
  isLoading?: boolean;
  isSubmitting?: boolean;
  isSaving?: boolean;
  isFetching?: boolean;
  [key: string]: boolean | undefined;
}

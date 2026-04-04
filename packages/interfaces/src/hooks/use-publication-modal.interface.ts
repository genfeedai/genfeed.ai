export interface UsePostModalOptions {
  onClose?: () => void;
  onRefresh?: () => void | Promise<void>;
}

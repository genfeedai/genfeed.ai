import type { GlobalModalsContextValue } from '@providers/global-modals/global-modals.provider';
import type { ClipboardService } from '@services/core/clipboard.service';

export type ArticleDetailHeaderState = {
  isNew: boolean;
  hasXArticleSections: boolean;
  isDirty: boolean;
  isSaving: boolean;
};

export type ArticleDetailHeaderPermissions = {
  canPublish: boolean;
  canArchive: boolean;
};

export type ArticleDetailHeaderProps = {
  state: ArticleDetailHeaderState;
  permissions: ArticleDetailHeaderPermissions;
  formLabel: string;
  plainTextContent: string;
  openConfirm: GlobalModalsContextValue['openConfirm'];
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCopyFullArticle: () => void;
  clipboardService: ClipboardService;
};

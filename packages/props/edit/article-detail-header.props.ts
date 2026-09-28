import type { GlobalModalsContextValue } from '@props/modals/global-modals.props';
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

import type { TwitterThreadResponse } from '@services/content/articles.service';
import type { ClipboardService } from '@services/core/clipboard.service';
import type { NotificationsService } from '@services/core/notifications.service';

export interface ModalTwitterThreadProps {
  thread: (TwitterThreadResponse & { articleId: string }) | null;
  isOpen: boolean;
  onClose: () => void;
  clipboardService: ClipboardService;
  notificationsService: NotificationsService;
}

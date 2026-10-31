import type { TwitterThreadResponse } from '@genfeedai/services/content/articles.service';
import type { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import type { NotificationsService } from '@genfeedai/services/core/notifications.service';

export interface ModalTwitterThreadProps {
  thread: (TwitterThreadResponse & { articleId: string }) | null;
  isOpen: boolean;
  onClose: () => void;
  clipboardService: ClipboardService;
  notificationsService: NotificationsService;
}

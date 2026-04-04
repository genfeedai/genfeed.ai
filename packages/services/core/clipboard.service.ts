import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';

export class ClipboardService {
  private static classInstance?: ClipboardService;
  private isCopying = false;

  private notificationsService = NotificationsService.getInstance();

  private constructor() {}

  public static getInstance(): ClipboardService {
    if (!ClipboardService.classInstance) {
      ClipboardService.classInstance = new ClipboardService();
    }

    return ClipboardService.classInstance;
  }

  public async copyToClipboard(text?: string): Promise<void> {
    this.isCopying = true;

    try {
      if (EnvironmentService.isProduction) {
        await navigator.clipboard.writeText(text ?? '');
      }
      this.notificationsService.success('Copied to clipboard');
    } catch (error) {
      logger.error('Copy to clipboard failed', error);
      this.notificationsService.error('Copy to clipboard');
    } finally {
      this.isCopying = false;
    }
  }

  public get isCopyingToClipboard() {
    return this.isCopying;
  }
}

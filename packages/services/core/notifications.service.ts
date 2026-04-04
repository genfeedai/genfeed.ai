import type { ReactNode } from 'react';
import { toast } from 'sonner';

export interface NotificationOptions {
  actionLabel?: string;
  description?: ReactNode;
  duration?: number;
  onAction?: () => void;
}

export class NotificationsService {
  private static classInstance?: NotificationsService;

  private constructor() {}

  public static getInstance(): NotificationsService {
    if (!NotificationsService.classInstance) {
      NotificationsService.classInstance = new NotificationsService();
    }

    return NotificationsService.classInstance;
  }

  public static clearInstance(): void {
    NotificationsService.classInstance = undefined;
  }

  private buildOptions(options?: NotificationOptions): {
    action?: { label: string; onClick: () => void };
    description?: ReactNode;
    duration?: number;
  } {
    if (!options) {
      return {};
    }

    const action =
      options.actionLabel && options.onAction
        ? {
            label: options.actionLabel,
            onClick: options.onAction,
          }
        : undefined;

    return {
      action,
      description: options.description,
      duration: options.duration,
    };
  }

  public info(message: string, options?: NotificationOptions): void {
    toast.info(message, this.buildOptions(options));
  }

  public success(message: string, options?: NotificationOptions): void {
    toast.success(message, this.buildOptions(options));
  }

  public error(message: string, options?: NotificationOptions): void {
    toast.error(`${message} failed`, this.buildOptions(options));
  }

  public warning(
    message: string,
    timeoutOrOptions?: number | NotificationOptions,
  ): void {
    const options =
      typeof timeoutOrOptions === 'number'
        ? { duration: timeoutOrOptions }
        : timeoutOrOptions;

    toast.warning(message, this.buildOptions(options));
  }
}

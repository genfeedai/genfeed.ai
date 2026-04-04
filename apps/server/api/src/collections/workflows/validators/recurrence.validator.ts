import { WorkflowRecurrence } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowRecurrenceType } from '@genfeedai/enums';

export class RecurrenceValidator {
  /**
   * Validate recurrence settings
   */
  static validate(recurrence?: WorkflowRecurrence): {
    valid: boolean;
    error?: string;
  } {
    if (!recurrence || recurrence.type === WorkflowRecurrenceType.ONCE) {
      return { valid: true };
    }

    // Check timezone
    if (recurrence.timezone) {
      try {
        // Test if timezone is valid
        Intl.DateTimeFormat(undefined, { timeZone: recurrence.timezone });
      } catch (error: unknown) {
        return { error: (error as Error).message, valid: false };
      }
    }

    // Check end date
    if (recurrence.endDate && recurrence.endDate <= new Date()) {
      return { error: 'End date must be in the future', valid: false };
    }

    return { valid: true };
  }

  /**
   * Calculate first run time with timezone applied
   */
  static calculateFirstRun(
    scheduledFor?: Date,
    recurrence?: WorkflowRecurrence,
  ): Date {
    if (!scheduledFor) {
      return new Date(); // Run immediately
    }

    // Apply timezone if specified
    if (recurrence?.timezone) {
      return RecurrenceValidator.applyTimezone(
        scheduledFor,
        recurrence.timezone,
      );
    }

    return scheduledFor;
  }

  /**
   * Apply timezone to date
   */
  private static applyTimezone(date: Date, timezone: string): Date {
    try {
      // Convert to target timezone
      const tzString = date.toLocaleString('en-US', { timeZone: timezone });
      return new Date(tzString);
    } catch (_e) {
      // If timezone conversion fails, return original date
      return date;
    }
  }
}

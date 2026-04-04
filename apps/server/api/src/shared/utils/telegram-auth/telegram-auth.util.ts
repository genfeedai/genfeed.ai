import * as crypto from 'node:crypto';

/**
 * Telegram Login Widget Authentication Utility
 *
 * Verifies the HMAC-SHA256 signature of Telegram auth data
 * according to official Telegram documentation:
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export class TelegramAuthUtil {
  /**
   * Verify Telegram auth data using HMAC-SHA256
   *
   * @param authData - Object containing auth data from Telegram
   * @param botToken - Telegram bot token
   * @returns true if valid, false otherwise
   */
  static verifyAuthData(
    authData: Record<string, unknown>,
    botToken: string,
  ): boolean {
    const { hash, ...dataToCheck } = authData;
    const receivedHash = typeof hash === 'string' ? hash : null;

    if (!receivedHash) {
      return false;
    }

    // Step 1: Create secret key from bot token
    const secretKey = crypto.createHash('sha256').update(botToken).digest();

    // Step 2: Create data check string
    // Sort keys alphabetically and join with newlines
    const dataCheckString = Object.keys(dataToCheck)
      .sort()
      .map((key) => `${key}=${dataToCheck[key]}`)
      .join('\n');

    // Step 3: Compute HMAC-SHA256
    const hmac = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Step 4: Compare computed HMAC with received hash using timing-safe comparison
    // to prevent timing attacks
    // Convert hex strings to Buffers for timingSafeEqual
    const hmacBuffer = Buffer.from(hmac, 'hex');
    const hashBuffer = Buffer.from(receivedHash, 'hex');

    // Ensure buffers are the same length (timingSafeEqual requires equal length)
    if (hmacBuffer.length !== hashBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(hmacBuffer, hashBuffer);
  }

  /**
   * Validate auth data freshness
   * Telegram auth data should not be older than 24 hours
   *
   * @param authDate - Unix timestamp from auth_date field
   * @param maxAgeSeconds - Maximum age in seconds (default: 86400 = 24 hours)
   * @returns true if fresh, false if expired
   */
  static isAuthDateValid(
    authDate: number,
    maxAgeSeconds: number = 86400,
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    const age = now - authDate;
    return age >= 0 && age <= maxAgeSeconds;
  }

  /**
   * Validate required fields are present
   *
   * @param authData - Auth data object
   * @returns true if all required fields present
   */
  static hasRequiredFields(authData: Record<string, unknown>): boolean {
    const required = ['id', 'first_name', 'auth_date', 'hash'];
    return required.every(
      (field) => authData[field] !== undefined && authData[field] !== null,
    );
  }
}

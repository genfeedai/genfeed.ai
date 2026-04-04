/**
 * Unit Test Setup - runs before all unit tests
 *
 * This setup is lighter than E2E setup - no MongoDB Memory Server needed
 * since unit tests should mock all database operations.
 */
import { vi } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';

// Mock Redis URL (tests should mock Redis operations)
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock notification service credentials
process.env.FCM_PROJECT_ID = 'test-mock-fcm-project';
process.env.RESEND_API_KEY = 're_test_mock_resend_key';
process.env.RESEND_FROM_EMAIL = 'Genfeed <test@genfeed.ai>';
process.env.TWILIO_ACCOUNT_SID = 'test-mock-twilio-sid';
process.env.TWILIO_AUTH_TOKEN = 'test-mock-twilio-token';

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});

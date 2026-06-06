/**
 * E2E Test Fixtures - Central Export
 *
 * This file exports all fixtures for convenient importing in tests.
 */

// API mock fixtures
export {
  mockActiveSubscription,
  mockAnalyticsData,
  mockAvatarGenerationSuccess,
  mockContentLibrary,
  mockEmptyContentLibrary,
  mockExpiredSubscription,
  mockImageGenerationFailure,
  mockImageGenerationSuccess,
  mockInsufficientCredits,
  mockMusicGenerationSuccess,
  mockNetworkError,
  mockOrganization,
  mockRateLimiting,
  mockServerError,
  mockUserProfile,
  mockVideoGenerationFailure,
  mockVideoGenerationSuccess,
  mockVideoGenerationWithProgress,
} from './api-mocks.fixture';
// Authentication fixtures
export {
  createAuthenticatedPage,
  expect,
  simulateLogout,
  simulateSessionExpiry,
  test,
} from './auth.fixture';

// Test data fixtures
export {
  createTestImage,
  createTestImageCollection,
  createTestMusic,
  createTestOrganization,
  createTestUser,
  createTestVideo,
  createTestVideoCollection,
  formatDateForInput,
  formData,
  getDateRange,
  getRandomPrompt,
  selectors,
  subscriptionPlans,
  testImages,
  testMusic,
  testOrganizations,
  testPrompts,
  testRoutes,
  testUsers,
  testVideos,
} from './test-data.fixture';

/**
 * E2E Test Utilities - Central Export
 *
 * This file exports all utility functions for convenient importing in tests.
 */

// API interceptor utilities
export {
  generateMockIngredient,
  generateMockOrganization,
  generateMockSubscription,
  generateMockUser,
  mockApiEndpoint,
  mockApiError,
  mockWebSocket,
  setupApiMocks,
} from './api-interceptor';

export { setupStrictNetworkGuard } from './network-guard';

// Test helper utilities
export {
  assertElementText,
  assertListCount,
  // Assertion helpers
  assertPageTitle,
  assertUrl,
  // Accessibility helpers
  checkBasicAccessibility,
  clearLocalStorage,
  // Interaction helpers
  clickButton,
  clickNavLink,
  closeModal,
  confirmDialog,
  dragAndDrop,
  // Form helpers
  fillField,
  fillForm,
  getLocalStorage,
  logPageState,
  // Navigation helpers
  navigateTo,
  selectDropdownOption,
  setCookies,
  // Storage helpers
  setLocalStorage,
  submitForm,
  // Screenshot/Debug helpers
  takeScreenshot,
  toggleSwitch,
  uploadFile,
  // Wait helpers
  waitForApiRequest,
  // Modal/Dialog helpers
  waitForModal,
  waitForPageReady,
  waitForToast,
} from './test-helpers';

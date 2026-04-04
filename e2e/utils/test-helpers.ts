import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Test Helper Utilities for Playwright E2E Tests
 *
 * Common utilities for interacting with the Genfeed application during testing.
 * These helpers abstract common patterns and provide type-safe interactions.
 *
 * @module test-helpers
 */

// ----------------------------------------------------------------------------
// Wait Helpers
// ----------------------------------------------------------------------------

/**
 * Waits for a specific network request to complete
 *
 * @param page - Playwright Page instance
 * @param urlPattern - URL pattern to match (substring or regex)
 * @param options - Additional options
 */
export async function waitForApiRequest(
  page: Page,
  urlPattern: string | RegExp,
  options: {
    method?: string;
    timeout?: number;
  } = {},
): Promise<void> {
  const { method, timeout = 10000 } = options;

  await page.waitForResponse(
    (response) => {
      const url = response.url();
      const matches =
        typeof urlPattern === 'string'
          ? url.includes(urlPattern)
          : urlPattern.test(url);

      if (!matches) {
        return false;
      }
      if (method && response.request().method() !== method) {
        return false;
      }

      return true;
    },
    { timeout },
  );
}

/**
 * Waits for the page to be fully loaded and interactive
 *
 * @param page - Playwright Page instance
 */
export async function waitForPageReady(page: Page): Promise<void> {
  // Wait for network to be idle
  await page.waitForLoadState('domcontentloaded');

  // Wait for any loading spinners to disappear
  const loadingIndicators = [
    '[data-testid="loading"]',
    '[data-testid="spinner"]',
    '.loading',
    '.spinner',
    '[aria-busy="true"]',
  ];

  for (const selector of loadingIndicators) {
    const element = page.locator(selector).first();
    const isVisible = await element.isVisible().catch(() => false);
    if (isVisible) {
      await element.waitFor({ state: 'hidden', timeout: 30000 });
    }
  }
}

/**
 * Waits for a toast notification to appear
 *
 * @param page - Playwright Page instance
 * @param text - Optional text to match in the toast
 */
export async function waitForToast(
  page: Page,
  text?: string,
): Promise<Locator> {
  const toastSelectors = [
    '[data-testid="toast"]',
    '[role="alert"]',
    '.toast',
    '.notiflix-notify',
  ];

  for (const selector of toastSelectors) {
    const toast = page.locator(selector).first();
    const isVisible = await toast.isVisible().catch(() => false);

    if (isVisible) {
      if (text) {
        await expect(toast).toContainText(text);
      }
      return toast;
    }
  }

  // Wait for any toast to appear
  const toast = page.locator(toastSelectors.join(', ')).first();
  await toast.waitFor({ state: 'visible', timeout: 10000 });

  if (text) {
    await expect(toast).toContainText(text);
  }

  return toast;
}

// ----------------------------------------------------------------------------
// Navigation Helpers
// ----------------------------------------------------------------------------

/**
 * Navigates to a specific route and waits for it to load
 *
 * @param page - Playwright Page instance
 * @param path - Route path (e.g., '/overview', '/g/video')
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForPageReady(page);
}

/**
 * Clicks a navigation link and waits for navigation
 *
 * @param page - Playwright Page instance
 * @param linkText - Text of the link to click
 */
export async function clickNavLink(
  page: Page,
  linkText: string,
): Promise<void> {
  const link = page.getByRole('link', { name: linkText });
  await link.click();
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Opens a dropdown menu and selects an option
 *
 * @param page - Playwright Page instance
 * @param triggerSelector - Selector for the dropdown trigger
 * @param optionText - Text of the option to select
 */
export async function selectDropdownOption(
  page: Page,
  triggerSelector: string,
  optionText: string,
): Promise<void> {
  await page.click(triggerSelector);
  await page.getByRole('option', { name: optionText }).click();
}

// ----------------------------------------------------------------------------
// Form Helpers
// ----------------------------------------------------------------------------

/**
 * Fills a form field by label
 *
 * @param page - Playwright Page instance
 * @param label - Label text of the field
 * @param value - Value to fill
 */
export async function fillField(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  await page.getByLabel(label).fill(value);
}

/**
 * Fills multiple form fields at once
 *
 * @param page - Playwright Page instance
 * @param fields - Object mapping label names to values
 */
export async function fillForm(
  page: Page,
  fields: Record<string, string>,
): Promise<void> {
  for (const [label, value] of Object.entries(fields)) {
    await fillField(page, label, value);
  }
}

/**
 * Submits a form and waits for the response
 *
 * @param page - Playwright Page instance
 * @param submitSelector - Selector for the submit button
 */
export async function submitForm(
  page: Page,
  submitSelector: string = 'button[type="submit"]',
): Promise<void> {
  await page.click(submitSelector);
  await page.waitForLoadState('domcontentloaded');
}

// ----------------------------------------------------------------------------
// Assertion Helpers
// ----------------------------------------------------------------------------

/**
 * Asserts that a page has a specific title
 *
 * @param page - Playwright Page instance
 * @param titlePattern - Expected title (string or regex)
 */
export async function assertPageTitle(
  page: Page,
  titlePattern: string | RegExp,
): Promise<void> {
  await expect(page).toHaveTitle(titlePattern);
}

/**
 * Asserts that the URL matches a pattern
 *
 * @param page - Playwright Page instance
 * @param urlPattern - Expected URL pattern (string or regex)
 */
export async function assertUrl(
  page: Page,
  urlPattern: string | RegExp,
): Promise<void> {
  await expect(page).toHaveURL(urlPattern);
}

/**
 * Asserts that an element is visible and contains text
 *
 * @param page - Playwright Page instance
 * @param selector - Element selector
 * @param text - Expected text content
 */
export async function assertElementText(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  const element = page.locator(selector);
  await expect(element).toBeVisible();
  await expect(element).toContainText(text);
}

/**
 * Asserts that a list has a specific number of items
 *
 * @param page - Playwright Page instance
 * @param listSelector - Selector for list items
 * @param count - Expected count
 */
export async function assertListCount(
  page: Page,
  listSelector: string,
  count: number,
): Promise<void> {
  const items = page.locator(listSelector);
  await expect(items).toHaveCount(count);
}

// ----------------------------------------------------------------------------
// Interaction Helpers
// ----------------------------------------------------------------------------

/**
 * Clicks a button by its text content
 *
 * @param page - Playwright Page instance
 * @param buttonText - Text of the button
 */
export async function clickButton(
  page: Page,
  buttonText: string,
): Promise<void> {
  await page.getByRole('button', { name: buttonText }).click();
}

/**
 * Toggles a switch/checkbox by label
 *
 * @param page - Playwright Page instance
 * @param label - Label of the switch
 * @param checked - Desired state
 */
export async function toggleSwitch(
  page: Page,
  label: string,
  checked: boolean,
): Promise<void> {
  const toggle = page.getByLabel(label);
  const currentState = await toggle.isChecked();

  if (currentState !== checked) {
    await toggle.click();
  }
}

/**
 * Uploads a file to an input
 *
 * @param page - Playwright Page instance
 * @param inputSelector - Selector for the file input
 * @param filePath - Path to the file to upload
 */
export async function uploadFile(
  page: Page,
  inputSelector: string,
  filePath: string,
): Promise<void> {
  const fileInput = page.locator(inputSelector);
  await fileInput.setInputFiles(filePath);
}

/**
 * Drags an element to a target location
 *
 * @param page - Playwright Page instance
 * @param sourceSelector - Selector for the draggable element
 * @param targetSelector - Selector for the drop target
 */
export async function dragAndDrop(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
): Promise<void> {
  const source = page.locator(sourceSelector);
  const target = page.locator(targetSelector);

  await source.dragTo(target);
}

// ----------------------------------------------------------------------------
// Modal/Dialog Helpers
// ----------------------------------------------------------------------------

/**
 * Waits for a modal to appear
 *
 * @param page - Playwright Page instance
 * @param modalSelector - Optional selector for the modal
 */
export async function waitForModal(
  page: Page,
  modalSelector?: string,
): Promise<Locator> {
  const selector = modalSelector || '[role="dialog"]';
  const modal = page.locator(selector);
  await modal.waitFor({ state: 'visible' });
  return modal;
}

/**
 * Closes a modal
 *
 * @param page - Playwright Page instance
 * @param closeMethod - Method to close ('button', 'escape', 'backdrop')
 */
export async function closeModal(
  page: Page,
  closeMethod: 'button' | 'escape' | 'backdrop' = 'button',
): Promise<void> {
  switch (closeMethod) {
    case 'button':
      await page.locator('[role="dialog"] button[aria-label="Close"]').click();
      break;
    case 'escape':
      await page.keyboard.press('Escape');
      break;
    case 'backdrop':
      await page.locator('[data-testid="modal-backdrop"]').click();
      break;
  }

  await page.locator('[role="dialog"]').waitFor({ state: 'hidden' });
}

/**
 * Confirms a dialog (clicks OK/Confirm button)
 *
 * @param page - Playwright Page instance
 */
export async function confirmDialog(page: Page): Promise<void> {
  const confirmButtons = ['Confirm', 'OK', 'Yes', 'Delete', 'Continue'];

  for (const text of confirmButtons) {
    const button = page.getByRole('button', { name: text });
    const isVisible = await button.isVisible().catch(() => false);

    if (isVisible) {
      await button.click();
      return;
    }
  }
}

// ----------------------------------------------------------------------------
// Storage/State Helpers
// ----------------------------------------------------------------------------

/**
 * Sets local storage items
 *
 * @param page - Playwright Page instance
 * @param items - Object of key-value pairs to set
 */
export async function setLocalStorage(
  page: Page,
  items: Record<string, string>,
): Promise<void> {
  await page.evaluate((storageItems) => {
    for (const [key, value] of Object.entries(storageItems)) {
      localStorage.setItem(key, value);
    }
  }, items);
}

/**
 * Gets a local storage item
 *
 * @param page - Playwright Page instance
 * @param key - Key to retrieve
 */
export async function getLocalStorage(
  page: Page,
  key: string,
): Promise<string | null> {
  return await page.evaluate((storageKey) => {
    return localStorage.getItem(storageKey);
  }, key);
}

/**
 * Clears all local storage
 *
 * @param page - Playwright Page instance
 */
export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
  });
}

/**
 * Sets cookies on the context
 *
 * @param context - Playwright BrowserContext instance
 * @param cookies - Array of cookie objects
 */
export async function setCookies(
  context: BrowserContext,
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>,
): Promise<void> {
  await context.addCookies(
    cookies.map((cookie) => ({
      domain: 'localhost',
      path: '/',
      ...cookie,
    })),
  );
}

// ----------------------------------------------------------------------------
// Screenshot/Debug Helpers
// ----------------------------------------------------------------------------

/**
 * Takes a screenshot with a descriptive name
 *
 * @param page - Playwright Page instance
 * @param name - Name for the screenshot
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    fullPage: true,
    path: `playwright-report/screenshots/${name}-${timestamp}.png`,
  });
}

/**
 * Logs the current page state for debugging
 *
 * @param page - Playwright Page instance
 */
export async function logPageState(page: Page): Promise<void> {
  const url = page.url();
  const title = await page.title();

  console.log('Page State:', {
    timestamp: new Date().toISOString(),
    title,
    url,
  });
}

// ----------------------------------------------------------------------------
// Accessibility Helpers
// ----------------------------------------------------------------------------

/**
 * Checks basic accessibility of the current page
 *
 * @param page - Playwright Page instance
 */
export async function checkBasicAccessibility(page: Page): Promise<void> {
  // Check for main landmark
  const main = page.locator('main');
  const mainExists = (await main.count()) > 0;
  expect(mainExists).toBe(true);

  // Check for page heading
  const h1 = page.locator('h1');
  const h1Exists = (await h1.count()) > 0;
  expect(h1Exists).toBe(true);

  // Check that all images have alt text
  const images = page.locator('img');
  const imageCount = await images.count();

  for (let i = 0; i < imageCount; i++) {
    const alt = await images.nth(i).getAttribute('alt');
    expect(alt).not.toBeNull();
  }

  // Check that all interactive elements are focusable
  const buttons = page.locator('button:not([disabled])');
  const buttonCount = await buttons.count();

  for (let i = 0; i < buttonCount; i++) {
    const tabIndex = await buttons.nth(i).getAttribute('tabindex');
    if (tabIndex !== null) {
      expect(Number(tabIndex)).toBeGreaterThanOrEqual(-1);
    }
  }
}

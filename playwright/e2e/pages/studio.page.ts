import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Studio Page
 *
 * Provides an abstraction layer for interacting with the main Studio/Generation page.
 * Handles video, image, music, and avatar generation flows.
 *
 * @module studio.page
 */
export class StudioPage {
  readonly page: Page;
  readonly url = '/studio';

  // Main layout elements
  readonly sidebar: Locator;
  readonly topbar: Locator;
  readonly mainContent: Locator;

  // Generation type tabs/buttons
  readonly videoTab: Locator;
  readonly imageTab: Locator;
  readonly musicTab: Locator;
  readonly avatarTab: Locator;

  // Prompt input area
  readonly promptInput: Locator;
  readonly promptTextarea: Locator;
  readonly generateButton: Locator;
  readonly clearPromptButton: Locator;

  // Generation settings
  readonly modelSelector: Locator;
  readonly aspectRatioSelector: Locator;
  readonly durationSelector: Locator;
  readonly qualitySelector: Locator;

  // Advanced options
  readonly advancedToggle: Locator;
  readonly advancedPanel: Locator;
  readonly negativePromptInput: Locator;
  readonly seedInput: Locator;

  // Results/Output area
  readonly resultsGrid: Locator;
  readonly resultCard: Locator;
  readonly videoPlayer: Locator;
  readonly imagePreview: Locator;

  // Loading states
  readonly loadingSpinner: Locator;
  readonly progressBar: Locator;
  readonly progressText: Locator;

  // Actions
  readonly downloadButton: Locator;
  readonly shareButton: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;

  // Credits display
  readonly creditsDisplay: Locator;

  constructor(page: Page) {
    this.page = page;

    // Layout
    this.sidebar = page.locator('[data-testid="sidebar"], aside, nav');
    this.topbar = page.locator('[data-testid="topbar"], header');
    this.mainContent = page.locator('main, [data-testid="main-content"]');

    // Generation tabs - common patterns
    this.videoTab = page.locator(
      '[data-testid="video-tab"], button:has-text("Video"), a[href*="video"]',
    );
    this.imageTab = page.locator(
      '[data-testid="image-tab"], button:has-text("Image"), a[href*="image"]',
    );
    this.musicTab = page.locator(
      '[data-testid="music-tab"], button:has-text("Music"), a[href*="music"]',
    );
    this.avatarTab = page.locator(
      '[data-testid="avatar-tab"], button:has-text("Avatar"), a[href*="avatar"]',
    );

    // Prompt area
    this.promptInput = page.locator(
      '[data-testid="prompt-input"], [data-testid="prompt-textarea"], textarea[placeholder*="prompt" i]',
    );
    this.promptTextarea = page.locator('textarea').first();
    this.generateButton = page.locator(
      '[data-testid="generate-button"], button:has-text("Generate"), button:has-text("Create")',
    );
    this.clearPromptButton = page.locator(
      '[data-testid="clear-prompt"], button[aria-label="Clear"]',
    );

    // Model/Settings selectors
    this.modelSelector = page.locator(
      '[data-testid="model-selector"], [data-testid="model-select"]',
    );
    this.aspectRatioSelector = page.locator(
      '[data-testid="aspect-ratio"], [data-testid="ratio-select"]',
    );
    this.durationSelector = page.locator(
      '[data-testid="duration-selector"], [data-testid="duration-select"]',
    );
    this.qualitySelector = page.locator(
      '[data-testid="quality-selector"], [data-testid="quality-select"]',
    );

    // Advanced options
    this.advancedToggle = page.locator(
      '[data-testid="advanced-toggle"], button:has-text("Advanced")',
    );
    this.advancedPanel = page.locator('[data-testid="advanced-panel"]');
    this.negativePromptInput = page.locator(
      '[data-testid="negative-prompt"], textarea[placeholder*="negative" i]',
    );
    this.seedInput = page.locator(
      '[data-testid="seed-input"], input[name="seed"]',
    );

    // Results
    this.resultsGrid = page.locator(
      '[data-testid="results-grid"], [data-testid="content-grid"]',
    );
    this.resultCard = page.locator(
      '[data-testid="result-card"], [data-testid="video-card"], [data-testid="image-card"]',
    );
    this.videoPlayer = page.locator('video, [data-testid="video-player"]');
    this.imagePreview = page.locator(
      '[data-testid="image-preview"], img[data-generated="true"]',
    );

    // Loading
    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.progressBar = page.locator(
      '[data-testid="progress-bar"], [role="progressbar"]',
    );
    this.progressText = page.locator('[data-testid="progress-text"]');

    // Actions
    this.downloadButton = page.locator(
      '[data-testid="download-button"], button:has-text("Download")',
    );
    this.shareButton = page.locator(
      '[data-testid="share-button"], button:has-text("Share")',
    );
    this.editButton = page.locator(
      '[data-testid="edit-button"], button:has-text("Edit")',
    );
    this.deleteButton = page.locator(
      '[data-testid="delete-button"], button:has-text("Delete")',
    );

    // Credits
    this.creditsDisplay = page.locator(
      '[data-testid="credits-display"], [data-testid="credits"]',
    );
  }

  /**
   * Navigate to the studio page
   */
  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  /**
   * Navigate to specific generation type
   */
  async gotoGenerationType(
    type: 'video' | 'image' | 'music' | 'avatar',
  ): Promise<void> {
    await this.page.goto(`/studio/${type}`);
    await this.waitForPageLoad();
  }

  /**
   * Wait for the studio page to fully load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');

    // Wait for main content to be visible
    await this.mainContent
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {
        // Some pages may use different structure
      });

    // Wait for any loading spinners to disappear
    const spinner = this.loadingSpinner;
    const isSpinnerVisible = await spinner.isVisible().catch(() => false);
    if (isSpinnerVisible) {
      await spinner.waitFor({ state: 'hidden', timeout: 30000 });
    }
  }

  /**
   * Check if the studio page is displayed
   */
  async isDisplayed(): Promise<boolean> {
    const url = this.page.url();
    return url.includes('/studio');
  }

  /**
   * Select a generation type tab
   */
  async selectGenerationType(
    type: 'video' | 'image' | 'music' | 'avatar',
  ): Promise<void> {
    const tabMap = {
      avatar: this.avatarTab,
      image: this.imageTab,
      music: this.musicTab,
      video: this.videoTab,
    };

    await tabMap[type].click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Enter a prompt for generation
   */
  async enterPrompt(prompt: string): Promise<void> {
    // Try multiple selectors for prompt input
    const input = this.promptInput.or(this.promptTextarea);
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill(prompt);
  }

  /**
   * Clear the prompt input
   */
  async clearPrompt(): Promise<void> {
    const input = this.promptInput.or(this.promptTextarea);
    await input.clear();
  }

  /**
   * Select a model for generation
   */
  async selectModel(modelName: string): Promise<void> {
    await this.modelSelector.click();

    // Wait for dropdown to appear
    await this.page.waitForSelector('[role="option"], [role="listbox"] li');

    // Click the model option
    await this.page.click(`[role="option"]:has-text("${modelName}")`);
  }

  /**
   * Select aspect ratio
   */
  async selectAspectRatio(ratio: string): Promise<void> {
    await this.aspectRatioSelector.click();
    await this.page.click(`[role="option"]:has-text("${ratio}")`);
  }

  /**
   * Click the generate button
   */
  async clickGenerate(): Promise<void> {
    await this.generateButton.click();
  }

  /**
   * Perform a complete generation flow
   */
  async generate(
    prompt: string,
    options?: {
      model?: string;
      aspectRatio?: string;
      waitForComplete?: boolean;
    },
  ): Promise<void> {
    const { model, aspectRatio, waitForComplete = true } = options || {};

    await this.enterPrompt(prompt);

    if (model) {
      await this.selectModel(model);
    }

    if (aspectRatio) {
      await this.selectAspectRatio(aspectRatio);
    }

    await this.clickGenerate();

    if (waitForComplete) {
      await this.waitForGenerationComplete();
    }
  }

  /**
   * Wait for generation to complete
   */
  async waitForGenerationComplete(timeout = 60000): Promise<void> {
    // Wait for loading to start
    await this.page.waitForTimeout(500);

    // Wait for loading to finish
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const isLoading = await this.loadingSpinner
        .isVisible()
        .catch(() => false);
      const hasProgress = await this.progressBar.isVisible().catch(() => false);

      if (!isLoading && !hasProgress) {
        // Check if result appeared
        const hasResult = await this.resultCard
          .first()
          .isVisible()
          .catch(() => false);
        if (hasResult) {
          return;
        }
      }

      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Get the current progress percentage
   */
  async getProgress(): Promise<number> {
    const progressText = await this.progressText.textContent();
    if (!progressText) {
      return 0;
    }

    const match = progressText.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Check if generation is in progress
   */
  async isGenerating(): Promise<boolean> {
    const hasSpinner = await this.loadingSpinner.isVisible().catch(() => false);
    const hasProgress = await this.progressBar.isVisible().catch(() => false);
    return hasSpinner || hasProgress;
  }

  /**
   * Get the number of results displayed
   */
  async getResultCount(): Promise<number> {
    return await this.resultCard.count();
  }

  /**
   * Click on a result card
   */
  async clickResult(index = 0): Promise<void> {
    await this.resultCard.nth(index).click();
  }

  /**
   * Download the generated content
   */
  async downloadResult(index = 0): Promise<void> {
    await this.clickResult(index);
    await this.downloadButton.click();
  }

  /**
   * Toggle advanced options panel
   */
  async toggleAdvancedOptions(): Promise<void> {
    await this.advancedToggle.click();
  }

  /**
   * Enter a negative prompt
   */
  async enterNegativePrompt(prompt: string): Promise<void> {
    await this.toggleAdvancedOptions();
    await this.negativePromptInput.fill(prompt);
  }

  /**
   * Get the displayed credits
   */
  async getCredits(): Promise<string> {
    return (await this.creditsDisplay.textContent()) || '';
  }

  /**
   * Assert that the generate button is enabled
   */
  async assertGenerateEnabled(): Promise<void> {
    await expect(this.generateButton).toBeEnabled();
  }

  /**
   * Assert that the generate button is disabled
   */
  async assertGenerateDisabled(): Promise<void> {
    await expect(this.generateButton).toBeDisabled();
  }

  /**
   * Assert that results are displayed
   */
  async assertResultsDisplayed(minCount = 1): Promise<void> {
    await expect(this.resultCard.first()).toBeVisible();
    const count = await this.getResultCount();
    expect(count).toBeGreaterThanOrEqual(minCount);
  }

  /**
   * Assert that an error message is displayed
   */
  async assertError(expectedText?: string): Promise<void> {
    const errorLocator = this.page.locator(
      '[role="alert"], [data-testid="error"]',
    );
    await expect(errorLocator).toBeVisible();

    if (expectedText) {
      await expect(errorLocator).toContainText(expectedText);
    }
  }

  /**
   * Get the video player source URL
   */
  async getVideoSource(): Promise<string> {
    return (await this.videoPlayer.getAttribute('src')) || '';
  }

  /**
   * Get the image preview source URL
   */
  async getImageSource(): Promise<string> {
    const img = this.imagePreview.or(this.page.locator('img[data-generated]'));
    return (await img.getAttribute('src')) || '';
  }
}

// UI helper functions for creating buttons and icons

import { findElement } from '~platforms/twitter-selectors';
import { logger } from '~utils/logger.util';

// SVG Icons
export const icons = {
  bookmark: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"></path>
    </svg>
  `,
  check: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
      <path d="m9 12 2 2 4-4"></path>
      <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1h18z"></path>
    </svg>
  `,
  edit: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  `,
  gif: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
      <text x="12" y="15" font-size="8" font-weight="bold" fill="currentColor" text-anchor="middle">GIF</text>
    </svg>
  `,
  image: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
      <circle cx="9" cy="9" r="2"></circle>
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
    </svg>
  `,
  replyWithMedia: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      <path d="M13 8l-2 2-2-2"></path>
      <path d="M11 10v4"></path>
    </svg>
  `,
  sparkles: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
      <path d="M20 3v4"></path>
      <path d="M22 5h-4"></path>
      <path d="M4 17v2"></path>
      <path d="M5 18H3"></path>
    </svg>
  `,
  spinner: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg" class="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
  `,
  video: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
      <polygon points="10 8 16 12 10 16 10 8"></polygon>
    </svg>
  `,
  x: `
    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 6 6 18"></path>
      <path d="m6 6 12 12"></path>
    </svg>
  `,
};

interface DropdownOptions {
  postUrl?: string;
}

// Helper to extract post content and author from the page
function extractPostContext(): { content: string; author: string } {
  const hostname = window.location.hostname;

  // LinkedIn selectors
  if (hostname.includes('linkedin.com')) {
    const postText = document.querySelector(
      '.feed-shared-update-v2__description, .feed-shared-text, [data-ad-preview="message"]',
    )?.textContent;
    const authorName = document.querySelector(
      '.feed-shared-actor__name, .update-components-actor__name',
    )?.textContent;

    return {
      author: authorName?.trim() || '',
      content: postText?.trim() || '',
    };
  }

  // Facebook selectors
  if (hostname.includes('facebook.com')) {
    const postText = document.querySelector(
      '[data-ad-preview="message"], ' +
        'div[data-testid="post_message"], ' +
        'div[dir="auto"][style*="text-align"]',
    )?.textContent;
    const authorName = document.querySelector(
      'h2[dir="auto"] a, ' +
        'span.fwb a, ' +
        '[data-testid="story-subtitle"] a',
    )?.textContent;

    return {
      author: authorName?.trim() || '',
      content: postText?.trim() || '',
    };
  }

  // Reddit selectors
  if (hostname.includes('reddit.com')) {
    const postText = document.querySelector(
      // New Reddit
      '[data-testid="post-content"], ' +
        'shreddit-post [slot="text-body"], ' +
        'div[data-click-id="text"], ' +
        // Old Reddit
        '.md-container .md, ' +
        '.expando .usertext-body',
    )?.textContent;
    const authorName = document.querySelector(
      // New Reddit
      'shreddit-post [slot="authorName"], ' +
        'a[data-testid="post_author_link"], ' +
        // Old Reddit
        '.author, ' +
        'a[href*="/user/"]',
    )?.textContent;

    return {
      author: authorName?.trim() || '',
      content: postText?.trim() || '',
    };
  }

  // Twitter/X - use resilient selectors
  const tweetTextEl = findElement('tweetText');
  const userNameEl = findElement('userName');

  return {
    author: userNameEl?.textContent || '',
    content: tweetTextEl?.textContent || '',
  };
}

// Convert data URL to File object
function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

// Inject media into Twitter's compose box (or route to other platforms)
async function injectMediaIntoTwitter(
  dataUrl: string,
  replyText: string,
): Promise<boolean> {
  const hostname = window.location.hostname;

  // Handle LinkedIn
  if (hostname.includes('linkedin.com')) {
    return injectMediaIntoLinkedIn(dataUrl, replyText);
  }

  // Handle Facebook
  if (hostname.includes('facebook.com')) {
    return injectMediaIntoFacebook(dataUrl, replyText);
  }

  // Handle Reddit
  if (hostname.includes('reddit.com')) {
    return injectMediaIntoReddit(dataUrl, replyText);
  }

  // Handle Twitter/X with resilient selectors
  try {
    // Find the reply textarea using resilient selector
    const replyBox = findElement('replyTextarea');

    if (!replyBox) {
      logger.warn('Could not find Twitter reply textarea');
      return false;
    }

    // Focus and set the reply text
    replyBox.focus();

    if (replyBox.isContentEditable) {
      replyBox.textContent = replyText;
      replyBox.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Find Twitter's file input using resilient selector
    let fileInput = findElement('fileInput') as HTMLInputElement | null;

    if (!fileInput) {
      // Try to click the media button to reveal the file input
      const mediaButton = findElement('mediaButton');

      if (mediaButton) {
        mediaButton.click();
        await new Promise((resolve) => setTimeout(resolve, 300));
        // Try again after clicking
        fileInput = findElement('fileInput') as HTMLInputElement | null;
      }
    }

    if (!fileInput) {
      logger.warn('Could not find Twitter file input');
      return false;
    }

    // Create a File from the data URL
    const file = dataUrlToFile(dataUrl, 'genfeed-image.png');

    // Create a DataTransfer to set files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Dispatch change event
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  } catch (error) {
    logger.error('Error injecting media into Twitter', error);
    return false;
  }
}

// Inject media into LinkedIn's compose box
async function injectMediaIntoLinkedIn(
  dataUrl: string,
  replyText: string,
): Promise<boolean> {
  try {
    // Find the comment box (LinkedIn uses contenteditable divs)
    const commentBox = document.querySelector(
      '.comments-comment-box__form-container [contenteditable="true"], ' +
        '.ql-editor[contenteditable="true"], ' +
        '[data-placeholder="Add a comment…"]',
    ) as HTMLElement;

    if (commentBox) {
      commentBox.focus();
      commentBox.textContent = replyText;
      commentBox.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // LinkedIn's image upload is more complex - try to find the file input
    // First, try to click the image/media button to reveal the input
    const mediaButton = document.querySelector(
      'button[aria-label*="image"], button[aria-label*="photo"], ' +
        '.comments-comment-box__media-button, ' +
        '[data-control-name="comment_image"]',
    ) as HTMLElement;

    if (mediaButton) {
      mediaButton.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Find the file input
    const fileInput = document.querySelector(
      'input[type="file"][accept*="image"], ' +
        '.comments-comment-box input[type="file"]',
    ) as HTMLInputElement;

    if (!fileInput) {
      // LinkedIn may not expose a file input for comments
      // Return partial success - text was injected
      return !!commentBox;
    }

    // Create a File from the data URL
    const file = dataUrlToFile(dataUrl, 'genfeed-image.png');

    // Create a DataTransfer to set files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Dispatch change event
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  } catch {
    return false;
  }
}

// Inject media into Facebook's compose box
async function injectMediaIntoFacebook(
  dataUrl: string,
  replyText: string,
): Promise<boolean> {
  try {
    // Facebook uses contenteditable divs for comments
    const commentBox = document.querySelector(
      '[contenteditable="true"][role="textbox"], ' +
        '[data-testid="UFI2CommentActionInput"] [contenteditable="true"], ' +
        'form[role="presentation"] [contenteditable="true"], ' +
        '.UFICommentContainer [contenteditable="true"]',
    ) as HTMLElement;

    if (commentBox) {
      commentBox.focus();
      commentBox.textContent = replyText;
      commentBox.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Try to find and click the photo/media button
    const mediaButton = document.querySelector(
      '[aria-label*="photo"], [aria-label*="Photo"], ' +
        '[data-testid="photo-video-button"], ' +
        'div[role="button"][aria-label*="Attach"]',
    ) as HTMLElement;

    if (mediaButton) {
      mediaButton.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Find the file input
    const fileInput = document.querySelector(
      'input[type="file"][accept*="image"], ' +
        'input[type="file"][multiple][accept]',
    ) as HTMLInputElement;

    if (!fileInput) {
      // Facebook may not expose file input for comments
      return !!commentBox;
    }

    // Create a File from the data URL
    const file = dataUrlToFile(dataUrl, 'genfeed-image.png');

    // Create a DataTransfer to set files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Dispatch change event
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  } catch (error) {
    logger.error('Error injecting media into Facebook', error);
    return false;
  }
}

// Inject media into Reddit's compose box
async function injectMediaIntoReddit(
  dataUrl: string,
  replyText: string,
): Promise<boolean> {
  try {
    // Reddit uses different editors depending on new/old design
    // New Reddit uses a contenteditable or a Markdown textarea
    const commentBox = document.querySelector(
      // New Reddit (Shreddit)
      'shreddit-composer [contenteditable="true"], ' +
        'div[data-testid="comment-submission-form-richtext"] [contenteditable="true"], ' +
        // Fancy pants editor
        '.DraftEditor-root [contenteditable="true"], ' +
        // Markdown mode
        'textarea[placeholder*="comment"], ' +
        'textarea[name="body"], ' +
        // Old Reddit
        '.usertext-edit textarea',
    ) as HTMLElement | HTMLTextAreaElement;

    if (commentBox) {
      commentBox.focus();

      if (commentBox instanceof HTMLTextAreaElement) {
        commentBox.value = replyText;
        commentBox.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (commentBox.isContentEditable) {
        commentBox.textContent = replyText;
        commentBox.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // Reddit's image upload button
    const mediaButton = document.querySelector(
      'button[aria-label*="image"], button[aria-label*="Image"], ' +
        '[data-testid="image-upload-button"], ' +
        'button[aria-label*="Add an image"]',
    ) as HTMLElement;

    if (mediaButton) {
      mediaButton.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Find the file input
    const fileInput = document.querySelector(
      'input[type="file"][accept*="image"], ' +
        'input[type="file"][accept*="video"]',
    ) as HTMLInputElement;

    if (!fileInput) {
      // Reddit may not have file input available for comments
      return !!commentBox;
    }

    // Create a File from the data URL
    const file = dataUrlToFile(dataUrl, 'genfeed-image.png');

    // Create a DataTransfer to set files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Dispatch change event
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  } catch (error) {
    logger.error('Error injecting media into Reddit', error);
    return false;
  }
}

// Inject video into Twitter's compose box (similar to image injection but for video)
async function injectVideoIntoTwitter(
  dataUrl: string,
  replyText: string,
): Promise<boolean> {
  const hostname = window.location.hostname;

  // Handle LinkedIn
  if (hostname.includes('linkedin.com')) {
    // LinkedIn comments don't support video, only text
    const commentBox = document.querySelector(
      '.comments-comment-box__form-container [contenteditable="true"], ' +
        '.ql-editor[contenteditable="true"]',
    ) as HTMLElement;

    if (commentBox) {
      commentBox.focus();
      commentBox.textContent = replyText;
      commentBox.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  // Handle Facebook
  if (hostname.includes('facebook.com')) {
    // Facebook comments may not support video
    const commentBox = document.querySelector(
      '[contenteditable="true"][role="textbox"]',
    ) as HTMLElement;

    if (commentBox) {
      commentBox.focus();
      commentBox.textContent = replyText;
      commentBox.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  // Handle Reddit - video upload in comments varies
  if (hostname.includes('reddit.com')) {
    const commentBox = document.querySelector(
      'shreddit-composer [contenteditable="true"], ' +
        'textarea[placeholder*="comment"], ' +
        'textarea[name="body"]',
    ) as HTMLElement | HTMLTextAreaElement;

    if (commentBox) {
      commentBox.focus();
      if (commentBox instanceof HTMLTextAreaElement) {
        commentBox.value = replyText;
      } else if (commentBox.isContentEditable) {
        commentBox.textContent = replyText;
      }
      commentBox.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  // Handle Twitter/X with resilient selectors
  try {
    // Find the reply textarea using resilient selector
    const replyBox = findElement('replyTextarea');

    if (!replyBox) {
      logger.warn('Could not find Twitter reply textarea for video');
      return false;
    }

    // Focus and set the reply text
    replyBox.focus();

    if (replyBox.isContentEditable) {
      replyBox.textContent = replyText;
      replyBox.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Find Twitter's file input using resilient selector
    let fileInput = findElement('fileInput') as HTMLInputElement | null;

    if (!fileInput) {
      // Try to click the media button to reveal the file input
      const mediaButton = findElement('mediaButton');

      if (mediaButton) {
        mediaButton.click();
        await new Promise((resolve) => setTimeout(resolve, 300));
        // Try again after clicking
        fileInput = findElement('fileInput') as HTMLInputElement | null;
      }
    }

    if (!fileInput) {
      logger.warn('Could not find Twitter file input for video');
      return false;
    }

    // Create a File from the data URL
    const file = dataUrlToFile(dataUrl, 'genfeed-video.mp4');

    // Create a DataTransfer to set files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Dispatch change event
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  } catch (error) {
    logger.error('Error injecting video into Twitter', error);
    return false;
  }
}

// Show a toast notification
function showGenfeedToast(message: string, isError: boolean = false) {
  const existingToast = document.querySelector('.genfeed-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `genfeed-toast${isError ? ' genfeed-toast-error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Inject global CSS for buttons
export function injectGlobalStyles() {
  const existingStyle = document.getElementById('genfeed-extension-styles');
  if (existingStyle) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = 'genfeed-extension-styles';
  style.textContent = `
    .genfeed-buttons {
      display: inline-flex;
      gap: 12px;
      align-items: center;
      margin-left: 8px;
      margin-right: 8px;
    }

    .genfeed-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      color: rgb(113, 118, 123);
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      border-radius: 50%;
      padding: 0;
    }

    .genfeed-btn:hover {
      color: rgb(29, 155, 240);
      background: rgba(29, 155, 240, 0.1);
    }

    .genfeed-btn:active {
      transform: scale(0.95);
    }

    .genfeed-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .genfeed-btn svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    /* Tooltip */
    .genfeed-btn::after {
      content: attr(title);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
      z-index: 1000;
      margin-bottom: 4px;
    }

    .genfeed-btn:hover::after {
      opacity: 1;
    }

    /* Dropdown */
    .genfeed-dropdown {
      position: relative;
      display: inline-block;
    }

    .genfeed-dropdown-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      background: rgb(29, 155, 240);
      color: white;
      border: none;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    .genfeed-dropdown-btn:hover {
      background: rgb(26, 140, 216);
    }

    .genfeed-dropdown-menu {
      position: absolute;
      top: 100%;
      right: 0;
      background: white;
      border: 1px solid rgb(207, 217, 222);
      border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
      z-index: 1000;
      min-width: 200px;
      margin-top: 4px;
      display: none;
    }

    .genfeed-dropdown-menu.active {
      display: block;
    }

    .genfeed-menu-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      cursor: pointer;
      transition: background-color 0.2s ease;
      font-size: 14px;
      font-weight: 400;
      color: rgb(15, 20, 25);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
    }

    .genfeed-menu-item:hover {
      background: rgb(247, 249, 249);
    }

    .genfeed-menu-item svg {
      margin-right: 12px;
      color: rgb(83, 100, 113);
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .genfeed-btn {
        color: rgb(113, 118, 123);
      }

      .genfeed-btn:hover {
        color: rgb(29, 155, 240);
        background: rgba(29, 155, 240, 0.1);
      }

      .genfeed-dropdown-menu {
        background: rgb(21, 32, 43);
        border-color: rgb(47, 51, 54);
      }

      .genfeed-menu-item {
        color: rgb(231, 233, 234);
      }

      .genfeed-menu-item:hover {
        background: rgb(32, 35, 39);
      }

      .genfeed-menu-item svg {
        color: rgb(113, 118, 123);
      }
    }

    /* Reference image hover actions */
    .genfeed-image-hoverable {
      position: relative;
    }

    .genfeed-image-overlay {
      position: absolute;
      right: 8px;
      bottom: 8px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      z-index: 1001;
    }

    .genfeed-image-hoverable:hover .genfeed-image-overlay {
      opacity: 1;
      pointer-events: auto;
    }

    .genfeed-image-action {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 9999px;
      background: rgba(15, 20, 25, 0.88);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
    }

    .genfeed-image-action:hover {
      transform: translateY(-1px);
      background: rgba(29, 155, 240, 0.95);
      border-color: rgba(29, 155, 240, 0.9);
    }

    .genfeed-image-action:disabled {
      opacity: 0.7;
      cursor: not-allowed;
      transform: none;
    }

    .genfeed-toast {
      position: fixed;
      right: 20px;
      bottom: 20px;
      padding: 12px 16px;
      border-radius: 12px;
      background: rgba(15, 20, 25, 0.92);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      z-index: 2000;
      max-width: 320px;
      line-height: 1.4;
    }

    .genfeed-toast-error {
      background: rgba(244, 33, 46, 0.92);
    }

    /* Animation for spinner */
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    .animate-spin {
      animation: spin 1s linear infinite;
    }
  `;
  document.head.appendChild(style);
}

// Create a save button
export function createSaveButton(
  postId: string,
  platform: string,
  postUrl: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'genfeed-btn genfeed-save-btn';
  button.title = 'Save to Genfeed';
  button.innerHTML = icons.bookmark;
  button.setAttribute('data-post-id', postId);
  button.setAttribute('data-platform', platform);

  button.addEventListener('click', async () => {
    const originalContent = button.innerHTML;
    button.innerHTML = icons.spinner;
    button.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        event: 'savePost',
        platform: platform,
        postId: postId,
        url: postUrl,
      });

      if (response?.success) {
        button.innerHTML = icons.check;
        button.title = 'Saved to Genfeed!';
        setTimeout(() => {
          button.innerHTML = originalContent;
          button.title = 'Save to Genfeed';
          button.disabled = false;
        }, 3000);
      } else {
        button.innerHTML = icons.x;
        button.title = 'Failed to save';
        setTimeout(() => {
          button.innerHTML = originalContent;
          button.title = 'Save to Genfeed';
          button.disabled = false;
        }, 2000);
      }
    } catch (error) {
      logger.error('Error saving post', error);
      button.innerHTML = icons.x;
      button.title = 'Error saving';
      setTimeout(() => {
        button.innerHTML = originalContent;
        button.title = 'Save to Genfeed';
        button.disabled = false;
      }, 2000);
    }
  });

  return button;
}

// Create an AI reply button
export function createAIReplyButton(
  postId: string,
  platform: string,
  replyTextareaSelector: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'genfeed-btn genfeed-ai-btn';
  button.title = 'Generate AI Reply';
  button.innerHTML = icons.sparkles;
  button.setAttribute('data-post-id', postId);
  button.setAttribute('data-platform', platform);

  button.addEventListener('click', async () => {
    const originalContent = button.innerHTML;
    button.innerHTML = icons.spinner;
    button.disabled = true;
    button.title = 'Generating reply...';

    try {
      const response = await chrome.runtime.sendMessage({
        event: 'generateReply',
        platform: platform,
        postAuthor: '',
        postContent: '',
        postId: postId,
        url: window.location.href,
      });

      if (response?.success && response?.reply) {
        // Find the reply textarea
        const replyBox = document.querySelector(replyTextareaSelector) as
          | HTMLTextAreaElement
          | HTMLElement;

        if (replyBox) {
          replyBox.focus();

          // Handle different types of input elements
          if (replyBox instanceof HTMLTextAreaElement) {
            replyBox.value = response.reply;
            replyBox.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (replyBox.isContentEditable) {
            replyBox.textContent = response.reply;
            replyBox.dispatchEvent(new Event('input', { bubbles: true }));
          }

          button.innerHTML = icons.check;
          button.title = 'Reply generated!';
        } else {
          button.innerHTML = icons.x;
          button.title = 'Could not find reply box';
        }
      } else {
        button.innerHTML = icons.x;
        button.title = 'Failed to generate reply';
      }

      setTimeout(() => {
        button.innerHTML = originalContent;
        button.title = 'Generate AI Reply';
        button.disabled = false;
      }, 3000);
    } catch (error) {
      logger.error('Error generating reply', error);
      button.innerHTML = icons.x;
      button.title = 'Error generating reply';
      setTimeout(() => {
        button.innerHTML = originalContent;
        button.title = 'Generate AI Reply';
        button.disabled = false;
      }, 2000);
    }
  });

  return button;
}

// Create Genfeed dropdown with actions
export function createGenFeedDropdown(
  _postId: string,
  platform: string,
  options: DropdownOptions = {},
): HTMLDivElement {
  const dropdown = document.createElement('div');
  dropdown.className = 'genfeed-dropdown';

  // Create the main button (using createElement to avoid XSS)
  const button = document.createElement('button');
  button.className = 'genfeed-dropdown-btn';
  const logoImg = document.createElement('img');
  logoImg.src = 'https://assets.genfeed.ai/branding/logo-white.png';
  logoImg.alt = 'Genfeed';
  logoImg.style.width = '16px';
  logoImg.style.height = '16px';
  button.appendChild(logoImg);

  // Create dropdown menu
  const menu = document.createElement('div');
  menu.className = 'genfeed-dropdown-menu';

  // Create menu items
  const rewriteItem = document.createElement('button');
  rewriteItem.className = 'genfeed-menu-item';
  rewriteItem.innerHTML = `
    ${icons.edit}
    <span>Rewrite Post</span>
  `;
  rewriteItem.addEventListener('click', () => {
    menu.classList.remove('active');
    // TODO: Implement rewrite functionality
  });

  const generateImageItem = document.createElement('button');
  generateImageItem.className = 'genfeed-menu-item';
  generateImageItem.innerHTML = `
    ${icons.image}
    <span>Generate Image</span>
  `;

  const buildMarketplacePrompt = () => {
    const title =
      document
        .querySelector('[data-testid="marketplace_pdp_title"], h1[dir="auto"]')
        ?.textContent?.trim() ||
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content');

    const price = document
      .querySelector(
        '[data-testid="marketplace_pdp_price"], span[aria-label*="Price"], div[aria-label*="price"]',
      )
      ?.textContent?.trim();

    const description = document
      .querySelector(
        '[data-testid="marketplace_pdp_description"], div[aria-label="Description"], div[role="main"] section div[dir="auto"]',
      )
      ?.textContent?.trim();

    const highlights = Array.from(
      document.querySelectorAll(
        '[data-testid="marketplace_pdp_badge"], [data-testid="marketplace_pdp_feature"], [data-testid="marketplace_pdp_details"] li',
      ),
    )
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => Boolean(text))
      .slice(0, 3)
      .join(', ');

    const similarAds = Array.from(
      document.querySelectorAll(
        '[data-testid="marketplace_pdp_similar_listing"] span, a[aria-label*="Marketplace listing"] span',
      ),
    )
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => Boolean(text))
      .slice(0, 2)
      .join('; ');

    const promptPieces = [
      title ? `Listing title: ${title}` : null,
      price ? `Price: ${price}` : null,
      highlights ? `Highlights: ${highlights}` : null,
      description ? `Description: ${description.slice(0, 240)}` : null,
      similarAds ? `Best nearby ads: ${similarAds}` : null,
    ].filter((text): text is string => Boolean(text));

    if (!promptPieces.length) {
      return null;
    }

    return `Use the best-performing Facebook Marketplace ad details to inspire a new, conversion-focused image: ${promptPieces.join(
      '. ',
    )}.`;
  };

  const buildImagePrompt = () => {
    if (platform === 'facebook-marketplace') {
      const marketplacePrompt = buildMarketplacePrompt();
      if (marketplacePrompt) {
        return marketplacePrompt;
      }
    }

    const ogTitle = document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute('content');
    const ogDescription = document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute('content');

    const parts = [
      `Create a high-performing image for ${platform} content leveraging the strongest ad angles on this page.`,
      ogTitle ? `Title: ${ogTitle}` : null,
      ogDescription ? `Details: ${ogDescription}` : null,
      options.postUrl ? `Source URL: ${options.postUrl}` : null,
      `Prioritize visuals that mirror the best ads to boost engagement.`,
    ].filter((text): text is string => Boolean(text));

    return parts.join(' ');
  };

  generateImageItem.addEventListener('click', async () => {
    menu.classList.remove('active');
    const originalContent = generateImageItem.innerHTML;
    generateImageItem.disabled = true;
    generateImageItem.innerHTML = `${icons.spinner}<span style="margin-left: 8px;">Generating...</span>`;

    try {
      const prompt = buildImagePrompt();
      const response = await chrome.runtime.sendMessage({
        event: 'generateImage',
        platform,
        prompt,
      });

      if (response?.success && response.imageUrl) {
        generateImageItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Open Image</span>`;
        generateImageItem.title = 'Open generated image on Genfeed';
        window.open(response.imageUrl, '_blank');
      } else {
        generateImageItem.innerHTML = `${icons.x}<span style="margin-left: 8px;">Retry</span>`;
        generateImageItem.title = response?.error || 'Failed to generate image';
      }
    } catch (error) {
      logger.error('Error generating image', error);
      generateImageItem.innerHTML = `${icons.x}<span style="margin-left: 8px;">Error</span>`;
      generateImageItem.title = 'Error generating image';
    } finally {
      setTimeout(() => {
        generateImageItem.innerHTML = originalContent;
        generateImageItem.disabled = false;
        generateImageItem.title = 'Generate Image';
      }, 2500);
    }
  });

  // Reply with Image item (main feature for generating reply + media)
  const replyWithImageItem = document.createElement('button');
  replyWithImageItem.className = 'genfeed-menu-item';
  replyWithImageItem.innerHTML = `
    ${icons.replyWithMedia}
    <span>Reply with Image</span>
  `;

  replyWithImageItem.addEventListener('click', async () => {
    menu.classList.remove('active');
    const originalContent = replyWithImageItem.innerHTML;
    replyWithImageItem.disabled = true;
    replyWithImageItem.innerHTML = `${icons.spinner}<span style="margin-left: 8px;">Generating reply & image...</span>`;
    showGenfeedToast('Generating your reply with image...');

    try {
      const context = extractPostContext();
      const response = await chrome.runtime.sendMessage({
        event: 'generateReplyWithMedia',
        mediaType: 'image',
        platform,
        postAuthor: context.author,
        postContent: context.content,
        postId: window.location.pathname,
        url: window.location.href,
      });

      if (response?.success && response?.reply) {
        // Inject the reply text
        const replyBox = document.querySelector(
          '[data-testid="tweetTextarea_0"]',
        ) as HTMLElement;

        if (replyBox) {
          replyBox.focus();
          if (replyBox.isContentEditable) {
            replyBox.textContent = response.reply;
            replyBox.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

        // If we have media, inject it
        if (response.mediaDataUrl) {
          const mediaInjected = await injectMediaIntoTwitter(
            response.mediaDataUrl,
            response.reply,
          );

          if (mediaInjected) {
            showGenfeedToast('Reply and image ready! Review and post.');
            replyWithImageItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Ready!</span>`;
          } else {
            showGenfeedToast(
              'Reply ready! Image copied - paste manually.',
              true,
            );
            // Open image in new tab as fallback
            const blob = await fetch(response.mediaDataUrl).then((r) =>
              r.blob(),
            );
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            replyWithImageItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Reply ready</span>`;
          }
        } else {
          showGenfeedToast(`Reply generated! ${response.error || ''}`);
          replyWithImageItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Reply ready</span>`;
        }
      } else {
        showGenfeedToast(response?.error || 'Failed to generate', true);
        replyWithImageItem.innerHTML = `${icons.x}<span style="margin-left: 8px;">Failed</span>`;
      }
    } catch (_error) {
      showGenfeedToast('Error generating reply', true);
      replyWithImageItem.innerHTML = `${icons.x}<span style="margin-left: 8px;">Error</span>`;
    } finally {
      setTimeout(() => {
        replyWithImageItem.innerHTML = originalContent;
        replyWithImageItem.disabled = false;
      }, 3000);
    }
  });

  // Reply with Video item
  const replyWithVideoItem = document.createElement('button');
  replyWithVideoItem.className = 'genfeed-menu-item';
  replyWithVideoItem.innerHTML = `
    ${icons.video}
    <span>Reply with Video</span>
  `;

  replyWithVideoItem.addEventListener('click', async () => {
    menu.classList.remove('active');
    const originalContent = replyWithVideoItem.innerHTML;
    replyWithVideoItem.disabled = true;
    replyWithVideoItem.innerHTML = `${icons.spinner}<span style="margin-left: 8px;">Generating video (~30-60s)...</span>`;
    showGenfeedToast(
      'Generating your reply with video... This may take up to a minute.',
    );

    try {
      const context = extractPostContext();
      const response = await chrome.runtime.sendMessage({
        duration: 5, // 5 second video
        event: 'generateReplyWithVideo',
        platform,
        postAuthor: context.author,
        postContent: context.content,
        postId: window.location.pathname,
        url: window.location.href,
      });

      if (response?.success && response?.reply) {
        // Inject the reply text using resilient selectors
        const replyBox = findElement('replyTextarea');

        if (replyBox) {
          replyBox.focus();
          if (replyBox.isContentEditable) {
            replyBox.textContent = response.reply;
            replyBox.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

        // If we have video data, inject it
        if (response.mediaDataUrl) {
          const mediaInjected = await injectVideoIntoTwitter(
            response.mediaDataUrl,
            response.reply,
          );

          if (mediaInjected) {
            showGenfeedToast('Reply and video ready! Review and post.');
            replyWithVideoItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Ready!</span>`;
          } else if (response.videoUrl) {
            // Fallback: Open video in new tab for manual download
            showGenfeedToast(
              'Reply ready! Video opened in new tab - download and attach manually.',
              true,
            );
            window.open(response.videoUrl, '_blank');
            replyWithVideoItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Reply ready</span>`;
          } else {
            showGenfeedToast('Reply ready! Video injection failed.', true);
            replyWithVideoItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Reply ready</span>`;
          }
        } else if (response.videoUrl) {
          // No data URL but have video URL - open for download
          showGenfeedToast(
            'Reply ready! Video opened in new tab - download and attach manually.',
          );
          window.open(response.videoUrl, '_blank');
          replyWithVideoItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Reply ready</span>`;
        } else {
          showGenfeedToast(`Reply generated! ${response.error || ''}`);
          replyWithVideoItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Reply ready</span>`;
        }
      } else {
        showGenfeedToast(response?.error || 'Failed to generate', true);
        replyWithVideoItem.innerHTML = `${icons.x}<span style="margin-left: 8px;">Failed</span>`;
      }
    } catch (_error) {
      showGenfeedToast('Error generating reply with video', true);
      replyWithVideoItem.innerHTML = `${icons.x}<span style="margin-left: 8px;">Error</span>`;
    } finally {
      setTimeout(() => {
        replyWithVideoItem.innerHTML = originalContent;
        replyWithVideoItem.disabled = false;
      }, 3000);
    }
  });

  // Reply with GIF item
  const replyWithGifItem = document.createElement('button');
  replyWithGifItem.className = 'genfeed-menu-item';
  replyWithGifItem.innerHTML = `
    ${icons.gif}
    <span>Reply with GIF</span>
  `;

  replyWithGifItem.addEventListener('click', async () => {
    menu.classList.remove('active');
    const originalContent = replyWithGifItem.innerHTML;
    replyWithGifItem.disabled = true;
    replyWithGifItem.innerHTML = `${icons.spinner}<span style="margin-left: 8px;">Generating GIF...</span>`;
    showGenfeedToast('Generating your reply with GIF...');

    try {
      const context = extractPostContext();
      const response = await chrome.runtime.sendMessage({
        event: 'generateReplyWithMedia',
        imagePrompt: `Create a fun, expressive animated-style image perfect for a GIF reaction that complements this context: "${context.content.substring(0, 100)}"`,
        mediaType: 'gif',
        platform,
        postAuthor: context.author,
        postContent: context.content,
        postId: window.location.pathname,
        url: window.location.href,
      });

      if (response?.success && response?.reply) {
        // Inject the reply text using resilient selectors
        const replyBox = findElement('replyTextarea');

        if (replyBox) {
          replyBox.focus();
          if (replyBox.isContentEditable) {
            replyBox.textContent = response.reply;
            replyBox.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

        // If we have media, inject it
        if (response.mediaDataUrl) {
          const mediaInjected = await injectMediaIntoTwitter(
            response.mediaDataUrl,
            response.reply,
          );

          if (mediaInjected) {
            showGenfeedToast('Reply and GIF ready! Review and post.');
            replyWithGifItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Ready!</span>`;
          } else {
            showGenfeedToast('Reply ready! GIF opened - paste manually.', true);
            // Open in new tab as fallback
            const blob = await fetch(response.mediaDataUrl).then((r) =>
              r.blob(),
            );
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            replyWithGifItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Reply ready</span>`;
          }
        } else {
          showGenfeedToast(`Reply generated! ${response.error || ''}`);
          replyWithGifItem.innerHTML = `${icons.check}<span style="margin-left: 8px;">Reply ready</span>`;
        }
      } else {
        showGenfeedToast(response?.error || 'Failed to generate', true);
        replyWithGifItem.innerHTML = `${icons.x}<span style="margin-left: 8px;">Failed</span>`;
      }
    } catch (_error) {
      showGenfeedToast('Error generating reply with GIF', true);
      replyWithGifItem.innerHTML = `${icons.x}<span style="margin-left: 8px;">Error</span>`;
    } finally {
      setTimeout(() => {
        replyWithGifItem.innerHTML = originalContent;
        replyWithGifItem.disabled = false;
      }, 3000);
    }
  });

  // Add items to menu - Reply with Image first as it's the main feature
  menu.appendChild(replyWithImageItem);
  menu.appendChild(replyWithVideoItem);
  menu.appendChild(replyWithGifItem);
  menu.appendChild(rewriteItem);
  menu.appendChild(generateImageItem);

  // Toggle dropdown
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('active');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    menu.classList.remove('active');
  });

  dropdown.appendChild(button);
  dropdown.appendChild(menu);

  return dropdown;
}

// Create a button container
export function createButtonContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'genfeed-buttons';
  return container;
}

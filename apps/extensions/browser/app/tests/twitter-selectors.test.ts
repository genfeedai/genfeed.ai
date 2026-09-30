import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkSelectorHealth,
  findAllElements,
  findElement,
  TWITTER_SELECTORS,
  waitForElement,
} from '~platforms/twitter-selectors';

describe('Twitter Selectors', () => {
  beforeEach(() => {
    // Reset the DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('TWITTER_SELECTORS configuration', () => {
    it('should have all required selector keys', () => {
      const requiredKeys = [
        'replyTextarea',
        'fileInput',
        'submitButton',
        'tweetContainer',
        'tweetText',
        'userName',
        'mediaButton',
        'actionsContainer',
      ];

      requiredKeys.forEach((key) => {
        expect(TWITTER_SELECTORS).toHaveProperty(key);
      });
    });

    it('should have primary selector for each config', () => {
      Object.values(TWITTER_SELECTORS).forEach((config) => {
        expect(config.primary).toBeDefined();
        expect(typeof config.primary).toBe('string');
        expect(config.primary.length).toBeGreaterThan(0);
      });
    });

    it('should have fallback selectors for each config', () => {
      Object.values(TWITTER_SELECTORS).forEach((config) => {
        expect(config.fallbacks).toBeDefined();
        expect(Array.isArray(config.fallbacks)).toBe(true);
        expect(config.fallbacks.length).toBeGreaterThan(0);
      });
    });

    it('should have description for each config', () => {
      Object.values(TWITTER_SELECTORS).forEach((config) => {
        expect(config.description).toBeDefined();
        expect(typeof config.description).toBe('string');
      });
    });
  });

  describe('findElement', () => {
    it('should find element with primary selector', () => {
      document.body.innerHTML = `
        <div data-testid="tweetTextarea_0" id="primary">Primary</div>
      `;

      const element = findElement('replyTextarea');
      expect(element).not.toBeNull();
      expect(element?.id).toBe('primary');
    });

    it('should fallback to secondary selector when primary fails', () => {
      document.body.innerHTML = `
        <div role="textbox" data-text="true" id="fallback">Fallback</div>
      `;

      const element = findElement('replyTextarea');
      expect(element).not.toBeNull();
      expect(element?.id).toBe('fallback');
    });

    it('should return null when no selector matches', () => {
      document.body.innerHTML = '<div>No matching elements</div>';

      const element = findElement('replyTextarea');
      expect(element).toBeNull();
    });

    it('should find element within a context', () => {
      document.body.innerHTML = `
        <div id="container">
          <div data-testid="tweet" id="inside">Inside</div>
        </div>
        <div data-testid="tweet" id="outside">Outside</div>
      `;

      const container = document.getElementById('container');
      const element = findElement('tweetContainer', container ?? undefined);
      expect(element).not.toBeNull();
      expect(element?.id).toBe('inside');
    });

    it('should return null for unknown selector key', () => {
      // @ts-expect-error Testing invalid key
      const element = findElement('unknownKey');
      expect(element).toBeNull();
    });
  });

  describe('findAllElements', () => {
    it('should find all matching elements', () => {
      document.body.innerHTML = `
        <article data-testid="tweet">Tweet 1</article>
        <article data-testid="tweet">Tweet 2</article>
        <article data-testid="tweet">Tweet 3</article>
      `;

      const elements = findAllElements('tweetContainer');
      expect(elements).toHaveLength(3);
    });

    it('should return empty array when no elements match', () => {
      document.body.innerHTML = '<div>No tweets here</div>';

      const elements = findAllElements('tweetContainer');
      expect(elements).toHaveLength(0);
    });

    it('should use fallback selector when primary finds nothing', () => {
      document.body.innerHTML = `
        <article role="article">Article 1</article>
        <article role="article">Article 2</article>
      `;

      const elements = findAllElements('tweetContainer');
      expect(elements).toHaveLength(2);
    });
  });

  describe('waitForElement', () => {
    it('should resolve immediately if element exists', async () => {
      document.body.innerHTML = `
        <div data-testid="tweetTextarea_0" id="exists">Exists</div>
      `;

      const element = await waitForElement('replyTextarea', 1000);
      expect(element).not.toBeNull();
      expect(element?.id).toBe('exists');
    });

    it('should resolve when element appears in DOM', async () => {
      const promise = waitForElement('replyTextarea', 2000);

      // Add element after a short delay
      setTimeout(() => {
        const el = document.createElement('div');
        el.setAttribute('data-testid', 'tweetTextarea_0');
        el.id = 'delayed';
        document.body.appendChild(el);
      }, 100);

      const element = await promise;
      expect(element).not.toBeNull();
      expect(element?.id).toBe('delayed');
    });

    it('should resolve with null on timeout', async () => {
      const element = await waitForElement('replyTextarea', 100);
      expect(element).toBeNull();
    });
  });

  describe('checkSelectorHealth', () => {
    it('should report healthy when critical selectors work', () => {
      document.body.innerHTML = `
        <div data-testid="tweetTextarea_0">Textarea</div>
        <article data-testid="tweet">Tweet</article>
        <div data-testid="tweetText">Text</div>
      `;

      const health = checkSelectorHealth();
      expect(health.healthy).toBe(true);
      expect(health.failingSelectors).toHaveLength(0);
    });

    it('should report unhealthy when critical selectors fail', () => {
      document.body.innerHTML = '<div>No Twitter elements</div>';

      const health = checkSelectorHealth();
      expect(health.healthy).toBe(false);
      expect(health.failingSelectors.length).toBeGreaterThan(0);
    });

    it('should list failing selectors', () => {
      document.body.innerHTML = `
        <article data-testid="tweet">Tweet</article>
      `;

      const health = checkSelectorHealth();
      expect(health.failingSelectors).toContain('replyTextarea');
      expect(health.failingSelectors).toContain('tweetText');
    });
  });

  describe('Semantic detection', () => {
    it('should find reply textarea semantically', () => {
      document.body.innerHTML = `
        <div aria-label="Reply to tweet">
          <div contenteditable="true" role="textbox" id="semantic" style="height: 50px; width: 200px;">
          </div>
        </div>
      `;

      // Make element visible for semantic detection
      const el = document.getElementById('semantic');
      if (!el) {
        throw new Error('Element not found');
      }
      Object.defineProperty(el, 'offsetParent', { value: document.body });
      Object.defineProperty(el, 'offsetHeight', { value: 50 });
      Object.defineProperty(el, 'offsetWidth', { value: 200 });

      const element = findElement('replyTextarea');
      expect(element).not.toBeNull();
    });

    it('should find file input semantically', () => {
      document.body.innerHTML = `
        <form>
          <input type="file" accept="image/*,video/*" id="semantic-file">
        </form>
      `;

      const element = findElement('fileInput');
      expect(element).not.toBeNull();
      expect(element?.id).toBe('semantic-file');
    });

    it('should find submit button semantically', () => {
      document.body.innerHTML = `
        <form>
          <button type="submit" aria-label="Post reply" id="semantic-btn">Post</button>
        </form>
      `;

      const element = findElement('submitButton');
      expect(element).not.toBeNull();
    });
  });
});

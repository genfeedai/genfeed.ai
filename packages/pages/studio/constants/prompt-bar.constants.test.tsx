import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';

describe('prompt-bar.constants', () => {
  it('should export constants', () => {
    const constants = require('@pages/studio/constants/prompt-bar.constants');
    expect(constants).toBeDefined();
  });
});

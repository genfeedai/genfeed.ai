import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

let matchersRegistered = false;

beforeEach(() => {
  if (!matchersRegistered && globalThis.expect) {
    globalThis.expect.extend(matchers);
    matchersRegistered = true;
  }
});

afterEach(() => {
  cleanup();
});

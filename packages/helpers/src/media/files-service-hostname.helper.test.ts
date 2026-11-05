import { describe, expect, it } from 'vitest';
import { isFilesServiceHostname } from './files-service-hostname.helper';

describe('isFilesServiceHostname', () => {
  it.each([
    ['files.genfeed.ai'],
    ['files.genfeed.localhost'],
    ['qa-local.files.genfeed.localhost'],
    ['  FILES.Genfeed.AI  '],
  ])('treats %j as the files service', (hostname) => {
    expect(isFilesServiceHostname(hostname)).toBe(true);
  });

  it.each([
    ['cdn.genfeed.ai'],
    ['files.genfeed.com'],
    ['notfiles.genfeed.ai'],
    ['files.genfeed.ai.evil.example'],
    ['files.genfeed.localhost.evil.example'],
    [''],
  ])('does not treat %j as the files service', (hostname) => {
    expect(isFilesServiceHostname(hostname)).toBe(false);
  });
});

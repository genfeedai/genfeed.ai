import { describe, expect, it } from 'vitest';
import {
  getSkillPackageFileByteLimit,
  hasSkillPackageControlCharacters,
  isSkillPackageEntryCountAllowed,
  isSkillPackageFileSizeAllowed,
  isSkillPackageTotalSizeAllowed,
  isValidSkillPackageChecksum,
  isValidSkillPackageSlug,
  isValidSkillPackageSourceUrl,
  normalizeSkillPackageChecksum,
  SKILL_PACKAGE_LIMITS,
  SKILL_PACKAGE_MAX_BASE64_CHARACTERS,
  SKILL_PACKAGE_MAX_SLUG_LENGTH,
  SKILL_PACKAGE_MAX_SOURCE_URL_BYTES,
} from './skill-package-import.constant';

describe('skill package import limits', () => {
  it('keeps the frozen bounds', () => {
    expect(SKILL_PACKAGE_LIMITS).toEqual({
      archiveBytes: 1_000_000,
      entries: 128,
      entryBytes: 128_000,
      totalBytes: 512_000,
    });
    expect(Object.isFrozen(SKILL_PACKAGE_LIMITS)).toBe(true);
    expect(SKILL_PACKAGE_MAX_BASE64_CHARACTERS).toBe(1_333_336);
  });

  it('bounds entry count, file size and total size at the limit', () => {
    expect(isSkillPackageEntryCountAllowed(128)).toBe(true);
    expect(isSkillPackageEntryCountAllowed(129)).toBe(false);
    expect(getSkillPackageFileByteLimit(true)).toBe(1_000_000);
    expect(getSkillPackageFileByteLimit(false)).toBe(128_000);
    expect(isSkillPackageFileSizeAllowed(128_000, false)).toBe(true);
    expect(isSkillPackageFileSizeAllowed(128_001, false)).toBe(false);
    expect(isSkillPackageFileSizeAllowed(1_000_000, true)).toBe(true);
    expect(isSkillPackageFileSizeAllowed(1_000_001, true)).toBe(false);
    expect(isSkillPackageTotalSizeAllowed(512_000)).toBe(true);
    expect(isSkillPackageTotalSizeAllowed(512_001)).toBe(false);
  });

  it('validates slugs', () => {
    expect(isValidSkillPackageSlug('My-Skill1')).toBe(true);
    expect(
      isValidSkillPackageSlug('a'.repeat(SKILL_PACKAGE_MAX_SLUG_LENGTH)),
    ).toBe(true);
    expect(
      isValidSkillPackageSlug('a'.repeat(SKILL_PACKAGE_MAX_SLUG_LENGTH + 1)),
    ).toBe(false);
    for (const bad of ['', '-skill', 'sk ill', 'sk/ill', 42, undefined])
      expect(isValidSkillPackageSlug(bad)).toBe(false);
  });

  it('validates source URLs', () => {
    expect(isValidSkillPackageSourceUrl('https://example.com/skill')).toBe(
      true,
    );
    expect(isValidSkillPackageSourceUrl('http://example.com')).toBe(true);
    const long = `https://example.com/${'a'.repeat(SKILL_PACKAGE_MAX_SOURCE_URL_BYTES)}`;
    for (const bad of [
      '',
      ' https://example.com',
      'file:///secret',
      'ftp://example.com',
      'https://user:pw@example.com',
      'https://example.com\\@evil.test',
      'https://example.com/\nx',
      long,
      'not a url',
      7,
    ])
      expect(isValidSkillPackageSourceUrl(bad)).toBe(false);
  });

  it('counts source URL length in UTF-8 bytes', () => {
    const prefix = 'https://example.com/';
    const fits =
      prefix + 'a'.repeat(SKILL_PACKAGE_MAX_SOURCE_URL_BYTES - prefix.length);
    expect(isValidSkillPackageSourceUrl(fits)).toBe(true);
    expect(isValidSkillPackageSourceUrl(`${fits.slice(0, -1)}é`)).toBe(false);
  });

  it('validates and normalizes checksums', () => {
    expect(isValidSkillPackageChecksum('A'.repeat(64))).toBe(true);
    expect(isValidSkillPackageChecksum(`sha256:${'a'.repeat(64)}`)).toBe(true);
    for (const bad of [
      '',
      'a'.repeat(63),
      'g'.repeat(64),
      `sha512:${'a'.repeat(64)}`,
      1,
    ])
      expect(isValidSkillPackageChecksum(bad)).toBe(false);
    expect(normalizeSkillPackageChecksum(`sha256:${'A'.repeat(64)}`)).toBe(
      'a'.repeat(64),
    );
  });

  it('detects C0, DEL and C1 control characters', () => {
    expect(hasSkillPackageControlCharacters('plain')).toBe(false);
    for (const bad of ['\u0000', '\n', '\u007f', '\u0085'])
      expect(hasSkillPackageControlCharacters(`a${bad}b`)).toBe(true);
  });
});

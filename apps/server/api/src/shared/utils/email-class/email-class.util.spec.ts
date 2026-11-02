import {
  classifyEmail,
  PERSONAL_EMAIL_DOMAIN_LIST,
  resolveDefaultOrganizationCategory,
} from '@api/shared/utils/email-class/email-class.util';
import { OrganizationCategory } from '@genfeedai/contracts';

describe('classifyEmail', () => {
  it.each([
    ['founder@acme.io', 'company'],
    ['Founder@Acme.IO', 'company'],
    ['poya@vitae.ai', 'company'],
    ['someone@gmail.com', 'personal'],
    ['someone@GMAIL.com', 'personal'],
    ['someone@proton.me', 'personal'],
    ['someone@mail.ru', 'personal'],
    ['someone@yahoo.co.jp', 'personal'],
    ['someone@mailinator.com', 'personal'],
    ['someone@guerrillamail.com', 'personal'],
    ['', 'unknown'],
    [null, 'unknown'],
    [undefined, 'unknown'],
    ['not-an-email', 'unknown'],
    ['two@@signs.com', 'unknown'],
  ] as const)('classifies %s as %s', (email, expected) => {
    expect(classifyEmail(email)).toBe(expected);
  });

  it('keeps the domain list lowercase and free of duplicates', () => {
    expect(PERSONAL_EMAIL_DOMAIN_LIST).toEqual(
      [...new Set(PERSONAL_EMAIL_DOMAIN_LIST)].map((domain) =>
        domain.toLowerCase(),
      ),
    );
  });
});

describe('resolveDefaultOrganizationCategory', () => {
  it.each([
    ['someone@gmail.com', OrganizationCategory.CREATOR],
    ['someone@googlemail.com', OrganizationCategory.CREATOR],
    ['someone@mailinator.com', OrganizationCategory.CREATOR],
    ['founder@acme.io', OrganizationCategory.BUSINESS],
    ['poya@vitae.ai', OrganizationCategory.BUSINESS],
    [null, OrganizationCategory.BUSINESS],
    [undefined, OrganizationCategory.BUSINESS],
    ['not-an-email', OrganizationCategory.BUSINESS],
  ] as const)('maps %s to %s', (email, expected) => {
    expect(resolveDefaultOrganizationCategory(email)).toBe(expected);
  });
});

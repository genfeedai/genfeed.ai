import { describe, expect, it } from 'vitest';
import { CredentialPlatform } from '..';
import {
  isArticleDeliveryPlatform,
  isNewsletterDeliveryPlatform,
} from './long-form-delivery.constant';

describe('long-form delivery platforms', () => {
  it('delivers articles to connected blogs only', () => {
    expect(isArticleDeliveryPlatform(CredentialPlatform.GHOST)).toBe(true);
    expect(isArticleDeliveryPlatform(CredentialPlatform.WORDPRESS)).toBe(true);
    expect(isArticleDeliveryPlatform(CredentialPlatform.MEDIUM)).toBe(true);
    expect(isArticleDeliveryPlatform(CredentialPlatform.DEV_TO)).toBe(true);
    expect(isArticleDeliveryPlatform(CredentialPlatform.BEEHIIV)).toBe(false);
    expect(isArticleDeliveryPlatform(undefined)).toBe(false);
  });

  it('delivers newsletters to Beehiiv only', () => {
    expect(isNewsletterDeliveryPlatform(CredentialPlatform.BEEHIIV)).toBe(true);
    expect(isNewsletterDeliveryPlatform(CredentialPlatform.GHOST)).toBe(false);
    expect(isNewsletterDeliveryPlatform('substack')).toBe(false);
  });
});

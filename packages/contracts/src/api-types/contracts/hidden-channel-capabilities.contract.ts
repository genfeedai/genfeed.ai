/**
 * Channels whose backend integration and publisher exist but whose scheduling
 * is refused until a live post has been verified on a real account.
 */
import { CredentialPlatform } from '../..';
import type { ChannelCapability } from './channel-capabilities.contract';

export const hiddenChannelCapabilities = [
  {
    caption: { maxLength: 500, required: true },
    description:
      'Backend integration for Mastodon instances; hidden until scheduler publishing is productized.',
    helpers: [
      {
        key: 'mastodon.credential',
        kind: 'credential',
        label: 'Mastodon credential',
        required: true,
      },
    ],
    label: 'Mastodon',
    media: {
      animated: { supported: true },
      kinds: ['image', 'video', 'link'],
      maxItems: 4,
      minItems: 0,
    },
    platform: CredentialPlatform.MASTODON,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [
      {
        description:
          'Defaults to the instance stored on the credential when left blank.',
        key: 'instanceUrl',
        label: 'Instance URL',
        type: 'url',
      },
      {
        defaultValue: 'public',
        key: 'visibility',
        label: 'Visibility',
        options: [
          { label: 'Public', value: 'public' },
          { label: 'Unlisted', value: 'unlisted' },
          { label: 'Followers only', value: 'private' },
        ],
        type: 'select',
      },
    ],
    status: 'hidden',
  },
  {
    caption: { maxLength: 1_500, required: true },
    description:
      'Standard update on a connected Google Business Profile location: text, one photo and an optional call-to-action button. Hidden until a live post has been verified on a real location.',
    helpers: [
      {
        key: 'google_business.locations',
        kind: 'account',
        label: 'Business location',
        required: true,
      },
    ],
    label: 'Google Business Profile',
    media: {
      animated: {
        consequence:
          'Animated images are not supported on Google Business Profile updates; use a still photo.',
        supported: false,
      },
      kinds: ['image'],
      maxItems: 1,
      minItems: 0,
    },
    platform: CredentialPlatform.GOOGLE_BUSINESS,
    publishModes: ['publish_now', 'scheduled'],
    settings: [
      {
        description: 'The button shown under the update. Leave blank for none.',
        key: 'callToActionType',
        label: 'Button',
        options: [
          { label: 'Book', value: 'BOOK' },
          { label: 'Order online', value: 'ORDER' },
          { label: 'Buy', value: 'SHOP' },
          { label: 'Learn more', value: 'LEARN_MORE' },
          { label: 'Sign up', value: 'SIGN_UP' },
          { label: 'Call now', value: 'CALL' },
        ],
        type: 'select',
      },
      {
        description:
          'Where the button leads. Not used for Call now, which dials the location.',
        key: 'callToActionUrl',
        label: 'Button link',
        type: 'url',
      },
    ],
    status: 'hidden',
  },
] satisfies ChannelCapability[];

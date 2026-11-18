/**
 * Scheduler capabilities of the messaging channels: Discord, Slack and
 * Telegram. Kept beside the main catalog, which merges them into `CHANNEL_CAPABILITIES`, where `channelCapabilitySchema` validates every
 * entry at load. This file must not import from the main catalog, which would
 * make an import cycle.
 */

import { CredentialPlatform } from '../..';

export const communityChannelCapabilities = [
  {
    // Discord rejects a message whose `content` is longer than 2000 characters.
    caption: { maxLength: 2_000, required: true },
    description:
      'Messages with images and video in a Discord channel, posted through the channel webhook the user granted at connect.',
    helpers: [
      {
        key: 'discord.credential',
        kind: 'credential',
        label: 'Discord channel',
        required: true,
      },
    ],
    label: 'Discord',
    media: {
      animated: { supported: true },
      kinds: ['image', 'video', 'link'],
      // Discord allows 10 attachments on a message.
      maxItems: 10,
      minItems: 0,
    },
    platform: CredentialPlatform.DISCORD,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [],
    status: 'supported',
  },
  {
    // Slack recommends at most 4,000 characters in `text`.
    caption: { maxLength: 4_000, required: true },
    description:
      'Messages with links and images in a Slack channel of a connected workspace.',
    helpers: [
      {
        key: 'slack.credential',
        kind: 'credential',
        label: 'Slack workspace',
        required: true,
      },
    ],
    label: 'Slack',
    media: {
      animated: { supported: true },
      kinds: ['image', 'link'],
      maxItems: 10,
      minItems: 0,
    },
    platform: CredentialPlatform.SLACK,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [
      {
        description:
          'The ID of the channel to post to, for example C0123456789. Invite the Genfeed app to a private channel first.',
        helper: 'slack.channels',
        key: 'channelId',
        label: 'Slack channel',
        required: true,
        type: 'string',
      },
    ],
    status: 'supported',
  },
  {
    // Telegram takes 4096 characters in a text message after parsing, and
    // 1024 in the caption of a photo or video (checked by the publisher).
    caption: { maxLength: 4_096, required: true },
    description:
      'Text, a photo or a video in a Telegram group the Genfeed bot was added to.',
    helpers: [
      {
        key: 'telegram.credential',
        kind: 'credential',
        label: 'Telegram group',
        required: true,
      },
    ],
    label: 'Telegram',
    media: {
      animated: { supported: true },
      kinds: ['image', 'video', 'link'],
      maxItems: 1,
      minItems: 0,
    },
    platform: CredentialPlatform.TELEGRAM,
    publishModes: ['draft', 'publish_now', 'scheduled'],
    settings: [],
    status: 'supported',
  },
];

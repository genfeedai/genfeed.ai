export type {
  Bot,
  Bot as BotDocument,
} from '@genfeedai/prisma';

export type BotTarget = {
  platform: string;
  channelId: string;
  channelLabel?: string;
  channelUrl?: string;
  credentialId?: string;
  liveChatId?: string;
  senderId?: string;
  isEnabled?: boolean;
};

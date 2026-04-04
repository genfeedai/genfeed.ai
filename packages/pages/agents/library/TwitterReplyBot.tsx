'use client';

import BotToggle from '@genfeedai/workflow/components/bots/BotToggle';
import { SiX } from 'react-icons/si';

const TWITTER_CONFIG_ITEMS = [
  { label: 'Response Mode', value: 'Mentions Only' },
  { label: 'Max Replies/Hour', value: '15' },
  { label: 'AI Model', value: 'GPT-4' },
  { label: 'Tone', value: 'Professional' },
];

export default function TwitterReplyBot(): JSX.Element {
  return (
    <BotToggle
      title="Twitter/X Reply Bot"
      description="Automatically reply to mentions and tweets"
      icon={<SiX className="w-6 h-6" />}
      iconBgColor="bg-foreground/10"
      editorPath="/workflows/twitter-reply"
      enabledMessage="Bot is active and responding to mentions"
      configItems={TWITTER_CONFIG_ITEMS}
    />
  );
}

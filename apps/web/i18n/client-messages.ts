import { type AppLocale, PSEUDO_LOCALE } from '@genfeedai/contracts/constants';
import agent from '../messages/en/agent.json';
import common from '../messages/en/common.json';
import ui from '../messages/en/ui.json';
import { pseudoLocalizeMessages } from './pseudo';

const SHARED_MESSAGES = { agent, common, ui } as const;

export function loadClientMessages(locale: AppLocale) {
  return locale === PSEUDO_LOCALE
    ? pseudoLocalizeMessages(SHARED_MESSAGES)
    : SHARED_MESSAGES;
}

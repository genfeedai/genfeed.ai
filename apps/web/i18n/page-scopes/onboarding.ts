import brandOsSettings from '../../messages/en/pages/brandOsSettings.json';
import brandVideoKit from '../../messages/en/pages/brandVideoKit.json';
import generationReceipts from '../../messages/en/pages/generationReceipts.json';
import library from '../../messages/en/pages/library.json';
import onboarding from '../../messages/en/pages/onboarding.json';
import platformFlags from '../../messages/en/pages/platformFlags.json';

const messages = {
  brandOsSettings,
  brandVideoKit: { diff: brandVideoKit.diff, options: brandVideoKit.options },
  generationReceipts: { identitySnapshot: generationReceipts.identitySnapshot },
  library: { knowledge: library.knowledge },
  onboarding,
  platformFlags,
};

export default messages;

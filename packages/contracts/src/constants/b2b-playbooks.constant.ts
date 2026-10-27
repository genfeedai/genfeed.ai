import type {
  B2bPlaybook,
  B2bReferenceSlot,
} from '../api-types/contracts/b2b-playbook.contract';
import { MODEL_KEYS } from './model-keys.constant';

const VIDEO_MODELS = [
  MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
  MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
];
const IMAGE_MODELS = [
  MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
  MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
];

// Defaults come from the brand's own website scan, never third-party media.
const productFrame: B2bReferenceSlot = {
  defaultSource: 'brand-scan',
  isRequired: true,
  key: 'product-frame',
  kind: 'image',
  label: 'Product frame',
  role: 'product_frame',
};
const brandLogo: B2bReferenceSlot = {
  defaultSource: 'brand-scan',
  isRequired: false,
  key: 'brand-logo',
  kind: 'image',
  label: 'Logo',
  role: 'brand_logo',
};
const person: B2bReferenceSlot = {
  defaultSource: 'library',
  isRequired: true,
  key: 'person',
  kind: 'image',
  label: 'Person on screen',
  role: 'person',
};

const noText =
  'Nothing the model draws reads as text, a logo or an interface; on-screen words are added after generation.';

/** Initial platform templates; persisted admin edits own the catalog after seeding. */
export const B2B_PLAYBOOKS: B2bPlaybook[] = [
  {
    aspectRatio: '16:9',
    allowedModels: VIDEO_MODELS,
    description: 'A 10 second clip that shows what the product does.',
    evaluationCriteria: [
      'The first frame is a real product view.',
      'One action arc and one camera move.',
      noText,
    ],
    format: 'product-explainer-clip',
    hookFormula:
      'Open on the problem the buyer already feels, then show the product resolving it in one move.',
    key: 'b2b-product-explainer-clip',
    label: 'Product explainer clip',
    mediaType: 'video',
    referenceSlots: [productFrame, brandLogo],
    shots: [
      {
        direction:
          'The real product frame, held steady, with the pain visible.',
        durationSeconds: 3,
        key: 'problem',
        title: 'Problem',
      },
      {
        direction:
          'One camera move toward the part of the product that fixes it.',
        durationSeconds: 5,
        key: 'resolve',
        title: 'Resolve',
      },
      {
        direction: 'Settle on the finished state for a clean end frame.',
        durationSeconds: 2,
        key: 'payoff',
        title: 'Payoff',
      },
    ],
  },
  {
    aspectRatio: '9:16',
    allowedModels: VIDEO_MODELS,
    description: 'A founder speaking to camera in their own setting.',
    evaluationCriteria: [
      'The person stays recognizable from the reference.',
      'Natural, restrained gestures; no invented backdrop text.',
      noText,
    ],
    format: 'founder-talking-clip',
    hookFormula:
      'Start with the single claim the founder would say out loud to a buyer.',
    key: 'b2b-founder-talking-clip',
    label: 'Founder talking clip',
    mediaType: 'video',
    referenceSlots: [
      person,
      { ...brandLogo, isRequired: false },
      {
        defaultSource: 'library',
        isRequired: false,
        key: 'voice',
        kind: 'audio',
        label: 'Voice sample',
        role: 'voiceover',
      },
    ],
    shots: [
      {
        direction: 'Direct to camera, eye level, a real working space behind.',
        durationSeconds: 8,
        key: 'to-camera',
        title: 'To camera',
      },
    ],
  },
  {
    aspectRatio: '1:1',
    allowedModels: IMAGE_MODELS,
    description: 'A customer quote as a clean card with the customer shown.',
    evaluationCriteria: [
      'The customer reads as a real person, not a stock face.',
      'Space is kept clear for the quote text added afterward.',
      noText,
    ],
    format: 'customer-quote-card',
    hookFormula:
      'Lead with the customer result in their words, not the product name.',
    key: 'b2b-customer-quote-card',
    label: 'Customer quote card',
    mediaType: 'image',
    referenceSlots: [
      { ...person, label: 'Customer' },
      { ...brandLogo, isRequired: false },
    ],
    shots: [
      {
        direction:
          'Portrait on the left third, calm background, open space on the right for the quote.',
        key: 'portrait',
        title: 'Portrait',
      },
    ],
  },
  {
    aspectRatio: '1:1',
    allowedModels: IMAGE_MODELS,
    description: 'One number or insight, large, with room for the figure.',
    evaluationCriteria: [
      'One focal element; the figure is added afterward.',
      'Brand colors only, no decorative extras.',
      noText,
    ],
    format: 'stat-insight-card',
    hookFormula:
      'State the number first, then the one thing it means for the buyer.',
    key: 'b2b-stat-insight-card',
    label: 'Stat or insight card',
    mediaType: 'image',
    referenceSlots: [
      {
        ...productFrame,
        isRequired: false,
        key: 'brand-style',
        label: 'Brand style',
        role: 'brand_style',
      },
    ],
    shots: [
      {
        direction:
          'A calm branded surface with a single focal shape and wide empty space for the figure.',
        key: 'surface',
        title: 'Surface',
      },
    ],
  },
  {
    aspectRatio: '4:5',
    allowedModels: IMAGE_MODELS,
    description: 'One slide of a case-study carousel, built around a result.',
    evaluationCriteria: [
      'The slide shows the result, not a generic office.',
      'Consistent with the other slides of the same story.',
      noText,
    ],
    format: 'case-study-slide',
    hookFormula:
      'Before, change, after: the slide carries one of the three, never all of them.',
    key: 'b2b-case-study-slide',
    label: 'Case-study slide',
    mediaType: 'image',
    referenceSlots: [productFrame, { ...person, isRequired: false }],
    shots: [
      {
        direction:
          'The real product screen or the customer in context, with clear space for the slide text.',
        key: 'result',
        title: 'Result',
      },
    ],
  },
  {
    aspectRatio: '9:16',
    allowedModels: VIDEO_MODELS,
    description: 'A short paid-social clip built to be varied and tested.',
    evaluationCriteria: [
      'The hook lands inside the first second.',
      'Only one thing changes between variations.',
      noText,
    ],
    format: 'ad-variation',
    hookFormula:
      'Pick one hook angle per variation: pain, result, or proof. Keep the rest identical.',
    key: 'b2b-ad-variation',
    label: 'Ad variation',
    mediaType: 'video',
    referenceSlots: [productFrame, { ...person, isRequired: false }],
    shots: [
      {
        direction: 'The hook angle, on a real product frame, immediately.',
        durationSeconds: 3,
        key: 'hook',
        title: 'Hook',
      },
      {
        direction: 'One camera move that shows the benefit.',
        durationSeconds: 5,
        key: 'benefit',
        title: 'Benefit',
      },
    ],
  },
];

export function b2bPlaybookId(key: string): string {
  return `cpresetbuiltin${key.replaceAll('-', '')}`;
}

import { describe, expect, it } from 'vitest';
import { MINIMAX_H3_MODEL_KEY } from '../api-types/contracts/video-generation-capability-profile.contract';
import { compileAdPreset } from './ad-preset-compiler';
import {
  type AdPresetAttachment,
  type AdPresetRequestInput,
  bindAdPresetReferences,
  planAdPresetRequest,
} from './ad-preset-request';
import { AD_PRESETS } from './ad-presets.constant';

const attachments: AdPresetAttachment[] = [
  { id: 'img-a', kind: 'image', role: 'person' },
  { id: 'vid-a', kind: 'video', role: 'facial_driver' },
  { id: 'img-b', kind: 'image', role: 'location' },
  { duration: 6.2, id: 'aud-a', kind: 'audio', role: 'voiceover' },
];
const input: AdPresetRequestInput = {
  attachments,
  model: MINIMAX_H3_MODEL_KEY,
  params: {
    aspectRatio: '9:16',
    dialogue: 'Try this. Keep every word.',
    lensMm: 24,
    qualityLook: 'Low-quality phone selfie',
  },
  preset: AD_PRESETS[0],
  presetId: 'preset-ugc-selfie',
};

describe('ad preset request', () => {
  it('counts tokens per kind in attachment order', () => {
    expect(bindAdPresetReferences(attachments)).toEqual({
      referenceRoles: [
        { role: 'person', token: '@Image1' },
        { role: 'facial_driver', token: '@Video1' },
        { role: 'location', token: '@Image2' },
        { role: 'voiceover', token: '@Audio1' },
      ],
      references: [
        { kind: 'image', token: '@Image1' },
        { kind: 'video', token: '@Video1' },
        { kind: 'image', token: '@Image2' },
        { duration: 6.2, kind: 'audio', token: '@Audio1' },
      ],
    });
  });

  it('plans the request the server will recompile, with ids split by field', () => {
    const plan = planAdPresetRequest(input);
    if (!plan.isOk) throw new Error(plan.message);
    const bound = bindAdPresetReferences(attachments);
    expect(plan.prompt).toBe(
      compileAdPreset({
        model: MINIMAX_H3_MODEL_KEY,
        params: { ...input.params, referenceRoles: bound.referenceRoles },
        preset: AD_PRESETS[0],
        references: bound.references,
      }).prompt,
    );
    expect(plan.duration).toBe(7);
    expect(plan.references).toEqual({
      audioReferences: ['aud-a'],
      references: ['img-a', 'img-b'],
      videoReferences: ['vid-a'],
    });
    expect(plan.submission).toEqual({
      params: {
        ...input.params,
        referenceRoles: bound.referenceRoles,
      },
      presetId: 'preset-ugc-selfie',
    });
  });

  it('carries the dialogue check opt-out only when it is off', () => {
    const off = planAdPresetRequest({
      ...input,
      isDialogueCheckEnabled: false,
    });
    const on = planAdPresetRequest({ ...input, isDialogueCheckEnabled: true });
    expect(off.isOk && off.submission.isDialogueCheckEnabled).toBe(false);
    expect(on.isOk && 'isDialogueCheckEnabled' in on.submission).toBe(false);
  });

  it.each([
    [
      'dialogue',
      'MISSING_DIALOGUE',
      { params: { ...input.params, dialogue: '  ' } },
    ],
    ['voice', 'MISSING_AUDIO', { attachments: attachments.slice(0, 3) }],
    [
      'duration',
      'DURATION_SHORTER_THAN_AUDIO',
      { params: { ...input.params, duration: 4 } },
    ],
    ['form', 'UNSUPPORTED_MODEL', { model: 'unreviewed/model' }],
    [
      'references',
      'REFERENCE_ROLE_MISMATCH',
      {
        attachments: attachments.map((attachment) =>
          attachment.kind === 'audio'
            ? { ...attachment, role: 'person' as const }
            : attachment,
        ),
      },
    ],
  ] as const)(
    'reports a %s error beside its field (%s)',
    (field, code, override) => {
      expect(planAdPresetRequest({ ...input, ...override })).toMatchObject({
        code,
        field,
        isOk: false,
      });
    },
  );
});

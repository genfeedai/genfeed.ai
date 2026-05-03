import { describe, expect, it } from 'bun:test';
import {
  buildFlux2DevPrompt,
  buildFlux2KleinPrompt,
  buildFluxDevPrompt,
  buildZImageTurboLoraPrompt,
  buildZImageTurboPrompt,
} from './prompt-builder';

describe('buildZImageTurboPrompt', () => {
  const prompt = buildZImageTurboPrompt({ prompt: 'a red car', seed: 42 });

  it('uses UNETLoader instead of CheckpointLoaderSimple', () => {
    const node1 = prompt['1'];
    expect(node1.class_type).toBe('UNETLoader');
    expect(node1.inputs).toEqual({
      unet_name: 'z_image_turbo_bf16.safetensors',
      weight_dtype: 'default',
    });
  });

  it('uses CLIPLoader with lumina2 type for Qwen encoder', () => {
    const node2 = prompt['2'];
    expect(node2.class_type).toBe('CLIPLoader');
    expect(node2.inputs).toEqual({
      clip_name: 'qwen_3_4b.safetensors',
      type: 'lumina2',
    });
  });

  it('references CLIPLoader output (node 2) for text encoding', () => {
    expect(prompt['3'].inputs.clip).toEqual(['2', 0]);
    expect(prompt['4'].inputs.clip).toEqual(['2', 0]);
  });

  it('uses separate VAELoader instead of checkpoint VAE output', () => {
    const vaeNode = prompt['7'];
    expect(vaeNode.class_type).toBe('VAELoader');
    expect(vaeNode.inputs).toEqual({ vae_name: 'ae.safetensors' });
  });

  it('VAEDecode references VAELoader output', () => {
    const decodeNode = prompt['8'];
    expect(decodeNode.class_type).toBe('VAEDecode');
    expect(decodeNode.inputs.vae).toEqual(['7', 0]);
  });

  it('uses euler_ancestral sampler', () => {
    expect(prompt['6'].inputs.sampler_name).toBe('euler_ancestral');
  });

  it('does not contain CheckpointLoaderSimple anywhere', () => {
    const classTypes = Object.values(prompt).map((n) => n.class_type);
    expect(classTypes).not.toContain('CheckpointLoaderSimple');
  });
});

describe('buildZImageTurboLoraPrompt', () => {
  const prompt = buildZImageTurboLoraPrompt({
    loraPath: 'test_lora.safetensors',
    prompt: 'a blue sky',
    seed: 99,
  });

  it('uses UNETLoader for split loading', () => {
    expect(prompt['1'].class_type).toBe('UNETLoader');
  });

  it('uses CLIPLoader with lumina2 type', () => {
    expect(prompt['2'].class_type).toBe('CLIPLoader');
    expect(prompt['2'].inputs.type).toBe('lumina2');
  });

  it('applies LoRA after split loaders', () => {
    expect(prompt['3'].class_type).toBe('LoraLoader');
    expect(prompt['3'].inputs.model).toEqual(['1', 0]);
    expect(prompt['3'].inputs.clip).toEqual(['2', 0]);
  });
});

describe('buildFlux2DevPrompt', () => {
  const prompt = buildFlux2DevPrompt({ prompt: 'sunset', seed: 1 });

  it('uses UNETLoader for split loading', () => {
    expect(prompt['1'].class_type).toBe('UNETLoader');
  });

  it('uses CLIPLoader with flux2 type', () => {
    expect(prompt['2'].class_type).toBe('CLIPLoader');
    expect(prompt['2'].inputs.type).toBe('flux2');
  });

  it('uses separate VAELoader', () => {
    expect(prompt['6'].class_type).toBe('VAELoader');
  });
});

describe('buildFlux2KleinPrompt', () => {
  const prompt = buildFlux2KleinPrompt({ prompt: 'mountain', seed: 7 });

  it('uses UNETLoader for split loading', () => {
    expect(prompt['1'].class_type).toBe('UNETLoader');
  });

  it('uses separate VAELoader', () => {
    expect(prompt['6'].class_type).toBe('VAELoader');
  });
});

describe('buildFluxDevPrompt (legacy Flux 1)', () => {
  const prompt = buildFluxDevPrompt({ prompt: 'hello', seed: 5 });

  it('still uses CheckpointLoaderSimple (Flux 1 single checkpoint)', () => {
    expect(prompt['1'].class_type).toBe('CheckpointLoaderSimple');
  });
});

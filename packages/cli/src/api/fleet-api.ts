import { getActiveProfile } from '@/config/store';
import { FleetApiError } from '@/utils/errors';

interface FleetHealthResponse {
  status: string;
  gpu: {
    name: string;
    memory_used: number;
    memory_total: number;
    utilization: number;
    temperature: number;
  };
  disk: {
    root: { used: string; total: string; percent: string };
    comfyui?: { used: string; total: string; percent: string };
  };
}

interface DatasetResponse {
  persona: string;
  path: string;
  image_count: number;
  caption_count: number;
  images: string[];
}

interface TrainRequest {
  persona_slug: string;
  trigger_word: string;
  lora_name: string;
  steps?: number;
  lora_rank?: number;
  learning_rate?: number;
  batch_size?: number;
  s3_bucket?: string;
}

interface TrainResponse {
  job_id: string;
  image_count: number;
}

interface TrainStatusResponse {
  job_id: string;
  status: 'running' | 'completed' | 'failed';
  stage: 'training' | 'postprocessing' | 'uploading' | 'completed' | 'failed';
  progress: number;
  started_at: string;
  completed_at?: string;
  persona_slug: string;
  lora_name: string;
  image_count: number;
  error: string | null;
}

interface CaptionRequest {
  persona_slug: string;
  trigger_word: string;
}

interface CaptionResponse {
  status: string;
  output: string;
}

interface LoraInfo {
  name: string;
  filename: string;
  size_mb: number;
  modified: string;
}

interface LorasResponse {
  loras: LoraInfo[];
}

interface ComfyActionResponse {
  action: string;
  returncode: number;
  stdout: string;
  stderr: string;
}

interface DatasetUploadResponse {
  persona: string;
  path: string;
  uploaded_count: number;
  files: string[];
}

interface DatasetDeleteResponse {
  persona: string;
  deleted: boolean;
}

interface GenerateResponse {
  job_id: string;
  status: string;
  images_total: number;
}

interface GenerateStatusResponse {
  job_id: string;
  job_type: string;
  status: 'running' | 'completed' | 'failed';
  stage: string;
  progress: number;
  started_at: string;
  completed_at?: string;
  persona: string;
  images_completed: number;
  images_total: number;
  filenames: string[];
  error: string | null;
}

interface PersonaInfo {
  handle: string;
  trigger_word?: string;
  lora_file?: string;
  has_pulid?: boolean;
  error?: string;
}

interface PersonasResponse {
  personas: PersonaInfo[];
}

async function getFleetBaseUrl(): Promise<string> {
  const { profile } = await getActiveProfile();
  return `http://${profile.fleetHost}:${profile.fleetApiPort}`;
}

async function fleetRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const baseUrl = await getFleetBaseUrl();
  const url = `${baseUrl}${path}`;

  try {
    const response = await fetch(url, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      method,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new FleetApiError(`Fleet API ${method} ${path} failed: ${response.status} ${text}`);
    }

    const raw = await response.text();
    if (!raw) {
      throw new FleetApiError(`Fleet API ${method} ${path} returned empty response`);
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    if (error instanceof FleetApiError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    throw new FleetApiError(
      `Cannot reach Fleet API at ${baseUrl}: ${message}`,
      'Ensure the fleet instance is running and fleet-api service is active'
    );
  }
}

export async function getFleetHealth(): Promise<FleetHealthResponse> {
  return fleetRequest<FleetHealthResponse>('GET', '/health');
}

export async function getDataset(persona: string): Promise<DatasetResponse> {
  return fleetRequest<DatasetResponse>('GET', `/datasets/${persona}`);
}

export async function startTraining(request: TrainRequest): Promise<TrainResponse> {
  return fleetRequest<TrainResponse>('POST', '/train', request);
}

export async function getTrainingStatus(jobId: string): Promise<TrainStatusResponse> {
  return fleetRequest<TrainStatusResponse>('GET', `/train/${jobId}`);
}

export async function runCaption(request: CaptionRequest): Promise<CaptionResponse> {
  return fleetRequest<CaptionResponse>('POST', '/caption', request);
}

export async function listLoras(): Promise<LorasResponse> {
  return fleetRequest<LorasResponse>('GET', '/loras');
}

export async function comfyAction(
  action: 'start' | 'stop' | 'restart' | 'status'
): Promise<ComfyActionResponse> {
  return fleetRequest<ComfyActionResponse>('POST', `/comfyui/${action}`);
}

export async function uploadDataset(
  persona: string,
  filePaths: string[]
): Promise<DatasetUploadResponse> {
  const { readFile } = await import('node:fs/promises');
  const { basename } = await import('node:path');
  const baseUrl = await getFleetBaseUrl();
  const url = `${baseUrl}/datasets/${persona}/upload`;

  const formData = new FormData();
  for (const filePath of filePaths) {
    const content = await readFile(filePath);
    const blob = new Blob([content]);
    formData.append('files', blob, basename(filePath));
  }

  try {
    const response = await fetch(url, { body: formData, method: 'POST' });

    if (!response.ok) {
      const text = await response.text();
      throw new FleetApiError(
        `Fleet API POST /datasets/${persona}/upload failed: ${response.status} ${text}`
      );
    }

    return (await response.json()) as DatasetUploadResponse;
  } catch (error) {
    if (error instanceof FleetApiError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new FleetApiError(
      `Cannot reach Fleet API at ${baseUrl}: ${message}`,
      'Ensure the fleet instance is running and fleet-api service is active'
    );
  }
}

export async function downloadDataset(persona: string, outDir: string): Promise<void> {
  const { mkdir, writeFile, unlink } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { join } = await import('node:path');
  const execFileAsync = promisify(execFile);

  const baseUrl = await getFleetBaseUrl();
  const url = `${baseUrl}/datasets/${persona}/download`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      throw new FleetApiError(
        `Fleet API GET /datasets/${persona}/download failed: ${response.status} ${text}`
      );
    }

    await mkdir(outDir, { recursive: true });
    const tarPath = join(outDir, `${persona}-dataset.tar.gz`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(tarPath, buffer);

    await execFileAsync('tar', ['xzf', tarPath, '-C', outDir]);
    await unlink(tarPath);
  } catch (error) {
    if (error instanceof FleetApiError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new FleetApiError(
      `Cannot reach Fleet API at ${baseUrl}: ${message}`,
      'Ensure the fleet instance is running and fleet-api service is active'
    );
  }
}

export async function deleteDataset(persona: string): Promise<DatasetDeleteResponse> {
  return fleetRequest<DatasetDeleteResponse>('DELETE', `/datasets/${persona}`);
}

export async function listPersonas(): Promise<PersonasResponse> {
  return fleetRequest<PersonasResponse>('GET', '/personas');
}

export async function startFaceTest(
  handle: string,
  personaConfig?: Record<string, unknown>
): Promise<GenerateResponse> {
  return fleetRequest<GenerateResponse>('POST', '/generate/face-test', {
    handle,
    persona_config: personaConfig,
  });
}

export async function startBootstrap(
  handle: string,
  promptCount?: number,
  personaConfig?: Record<string, unknown>
): Promise<GenerateResponse> {
  return fleetRequest<GenerateResponse>('POST', '/generate/bootstrap', {
    handle,
    persona_config: personaConfig,
    prompt_count: promptCount ?? 50,
  });
}

export async function startPulid(
  handle: string,
  mode: string = 'scenes',
  personaConfig?: Record<string, unknown>
): Promise<GenerateResponse> {
  return fleetRequest<GenerateResponse>('POST', '/generate/pulid', {
    handle,
    mode,
    persona_config: personaConfig,
  });
}

export async function startContentGenerate(
  handle: string,
  personaConfig?: Record<string, unknown>
): Promise<GenerateResponse> {
  return fleetRequest<GenerateResponse>('POST', '/generate/content', {
    handle,
    persona_config: personaConfig,
  });
}

export async function getGenerateStatus(jobId: string): Promise<GenerateStatusResponse> {
  return fleetRequest<GenerateStatusResponse>('GET', `/generate/${jobId}`);
}

export type {
  CaptionRequest,
  CaptionResponse,
  ComfyActionResponse,
  DatasetDeleteResponse,
  DatasetResponse,
  DatasetUploadResponse,
  FleetHealthResponse,
  GenerateResponse,
  GenerateStatusResponse,
  LoraInfo,
  LorasResponse,
  PersonaInfo,
  PersonasResponse,
  TrainRequest,
  TrainResponse,
  TrainStatusResponse,
};

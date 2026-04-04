import type { IErrorDebugInfo } from '@cloud/interfaces/modals/error-debug.interface';

type Listener = (info: IErrorDebugInfo) => void;

let errorDebugInfo: IErrorDebugInfo | null = null;
const listeners = new Set<Listener>();

export function setErrorDebugInfo(info: IErrorDebugInfo): void {
  errorDebugInfo = info;
  listeners.forEach((fn) => fn(info));
}

export function getErrorDebugInfo(): IErrorDebugInfo | null {
  return errorDebugInfo;
}

export function clearErrorDebugInfo(): void {
  errorDebugInfo = null;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

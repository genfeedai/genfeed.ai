export interface HarnessPackRegistry<TPack> {
  registerPack(pack: TPack): void;
  get(id: string): TPack | undefined;
  list(): TPack[];
}

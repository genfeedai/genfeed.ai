import type { Voice } from '@genfeedai/models/ingredients/voice.model';
import { IngredientsService } from '@services/content/ingredients.service';
import type { JsonApiResponseDocument } from '@services/core/base.service';

export class VoiceCloneService extends IngredientsService<Voice> {
  constructor(token: string) {
    super('voices', token);
  }

  static getInstance(token: string): VoiceCloneService {
    return IngredientsService.getDataServiceInstance(VoiceCloneService, token);
  }

  async cloneVoice(formData: FormData): Promise<Voice> {
    return await this.instance
      .post<JsonApiResponseDocument>('/clone', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => this.mapOne(res.data));
  }

  async getClonedVoices(): Promise<Voice[]> {
    return await this.instance
      .get<JsonApiResponseDocument>('/cloned')
      .then((res) => this.mapMany(res.data));
  }

  async deleteClonedVoice(id: string): Promise<Voice> {
    return await this.instance
      .delete<JsonApiResponseDocument>(`/clone/${id}`)
      .then((res) => this.mapOne(res.data));
  }
}

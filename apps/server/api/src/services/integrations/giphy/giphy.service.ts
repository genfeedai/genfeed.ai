import fs from 'node:fs';
import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GiphyService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly apiKey: string;
  private readonly uploadUrl = 'https://upload.giphy.com/v1/gifs';

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get('GIPHY_API_KEY') || 'giphy-api-key';
  }

  async uploadGif(filePath: string, tags = ''): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const form = new FormData();
    form.append('api_key', this.apiKey);
    form.append('file', fs.createReadStream(filePath));

    if (tags) {
      form.append('tags', tags);
    }

    try {
      const res = await firstValueFrom(
        this.httpService.post(this.uploadUrl, form, {
          headers: form.getHeaders(),
        }),
      );
      this.loggerService.log(`${url} success`, res.data);
      return res.data?.data?.id || '';
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}

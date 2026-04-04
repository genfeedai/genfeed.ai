import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface NftResponse {
  image: string;
  name?: string;
  isNft: boolean;
}

@Injectable()
export class SolanaService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.endpoint = this.configService.get('SOLANA_URL') || 'solana-endpoint';
    this.apiKey = this.configService.get('SOLANA_KEY') || 'solana-api-key';
  }

  public async getNft(
    address: string,
  ): Promise<{ image: string; name?: string }> {
    const url = `${this.endpoint}/nft/${address}`;
    const logUrl = `${this.constructorName} getNft`;
    try {
      this.loggerService.log(`${logUrl} started`, { address });
      const res = await firstValueFrom(
        this.httpService.get(url, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
      if (res.status !== 200) {
        throw new Error('Solana service returned non-200 status');
      }
      const data: NftResponse = res.data || {};
      if (!data.isNft) {
        throw new Error('Address is not an NFT');
      }
      if (!data.image) {
        throw new Error('NFT image not found');
      }
      this.loggerService.log(`${logUrl} success`, data);
      return { image: data.image, name: data.name };
    } catch (error: unknown) {
      this.loggerService.error(`${logUrl} failed`, error);
      throw error;
    }
  }
}

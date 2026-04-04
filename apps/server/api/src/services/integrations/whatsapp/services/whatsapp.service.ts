import { ConfigService } from '@api/config/config.service';
import type {
  IWhatsappMessageResponse,
  IWhatsappMessageStatusResponse,
  IWhatsappSendMessageParams,
  IWhatsappSendTemplateParams,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class WhatsappService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  private getBaseUrl(): string {
    const accountSid = this.configService.get('WHATSAPP_TWILIO_ACCOUNT_SID');
    return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
  }

  private getAuthHeader(): string {
    const accountSid = this.configService.get('WHATSAPP_TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get('WHATSAPP_TWILIO_AUTH_TOKEN');
    return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
  }

  private getFromNumber(): string {
    const phoneNumber = this.configService.get('WHATSAPP_TWILIO_PHONE_NUMBER');
    return `whatsapp:${phoneNumber}`;
  }

  public async sendTextMessage(
    params: IWhatsappSendMessageParams,
  ): Promise<IWhatsappMessageResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const formData = new URLSearchParams({
        Body: params.body,
        From: this.getFromNumber(),
        To: `whatsapp:${params.to}`,
      });

      const response = await firstValueFrom(
        this.httpService.post<IWhatsappMessageResponse>(
          `${this.getBaseUrl()}/Messages.json`,
          formData.toString(),
          {
            headers: {
              Authorization: this.getAuthHeader(),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        messageSid: response.data.sid,
        to: params.to,
      });
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async sendMediaMessage(
    params: IWhatsappSendMessageParams,
  ): Promise<IWhatsappMessageResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const formData = new URLSearchParams({
        Body: params.body,
        From: this.getFromNumber(),
        To: `whatsapp:${params.to}`,
      });

      if (params.mediaUrl) {
        formData.append('MediaUrl', params.mediaUrl);
      }

      const response = await firstValueFrom(
        this.httpService.post<IWhatsappMessageResponse>(
          `${this.getBaseUrl()}/Messages.json`,
          formData.toString(),
          {
            headers: {
              Authorization: this.getAuthHeader(),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        hasMedia: !!params.mediaUrl,
        messageSid: response.data.sid,
        to: params.to,
      });
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async sendTemplateMessage(
    params: IWhatsappSendTemplateParams,
  ): Promise<IWhatsappMessageResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const formData = new URLSearchParams({
        ContentSid: params.templateSid,
        From: this.getFromNumber(),
        To: `whatsapp:${params.to}`,
      });

      if (params.variables) {
        formData.append('ContentVariables', JSON.stringify(params.variables));
      }

      const response = await firstValueFrom(
        this.httpService.post<IWhatsappMessageResponse>(
          `${this.getBaseUrl()}/Messages.json`,
          formData.toString(),
          {
            headers: {
              Authorization: this.getAuthHeader(),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        messageSid: response.data.sid,
        templateSid: params.templateSid,
        to: params.to,
      });
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getMessageStatus(
    messageSid: string,
  ): Promise<IWhatsappMessageStatusResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get<IWhatsappMessageStatusResponse>(
          `${this.getBaseUrl()}/Messages/${messageSid}.json`,
          {
            headers: {
              Authorization: this.getAuthHeader(),
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        messageSid,
        status: response.data.status,
      });
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}

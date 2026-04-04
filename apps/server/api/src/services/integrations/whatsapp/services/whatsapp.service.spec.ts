import { ConfigService } from '@api/config/config.service';
import { WhatsappService } from '@api/services/integrations/whatsapp/services/whatsapp.service';
import type {
  IWhatsappMessageResponse,
  IWhatsappMessageStatusResponse,
  IWhatsappSendMessageParams,
  IWhatsappSendTemplateParams,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockAccountSid = 'AC1234567890abcdef';
  const mockAuthToken = 'auth-token-secret';
  const mockPhoneNumber = '+14155238886';

  const createMockMessageResponse = (
    overrides: Partial<IWhatsappMessageResponse> = {},
  ): IWhatsappMessageResponse => ({
    body: 'Hello from test',
    dateCreated: '2024-01-01T00:00:00Z',
    dateSent: '2024-01-01T00:00:01Z',
    dateUpdated: '2024-01-01T00:00:01Z',
    direction: 'outbound-api',
    errorCode: null,
    errorMessage: null,
    from: `whatsapp:${mockPhoneNumber}`,
    numMedia: '0',
    numSegments: '1',
    price: null,
    priceUnit: 'USD',
    sid: 'SM1234567890abcdef',
    status: 'queued',
    to: 'whatsapp:+15551234567',
    uri: '/2010-04-01/Accounts/AC1234567890abcdef/Messages/SM1234567890abcdef.json',
    ...overrides,
  });

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          WHATSAPP_TWILIO_ACCOUNT_SID: mockAccountSid,
          WHATSAPP_TWILIO_AUTH_TOKEN: mockAuthToken,
          WHATSAPP_TWILIO_PHONE_NUMBER: mockPhoneNumber,
        };
        return config[key];
      }),
    };

    const mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendTextMessage', () => {
    it('should send a text message successfully', async () => {
      const mockResponse = createMockMessageResponse();
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: IWhatsappSendMessageParams = {
        body: 'Hello from test',
        to: '+15551234567',
      };

      const result = await service.sendTextMessage(params);

      expect(result).toEqual(mockResponse);
      expect(httpService.post).toHaveBeenCalledWith(
        `https://api.twilio.com/2010-04-01/Accounts/${mockAccountSid}/Messages.json`,
        expect.stringContaining('Body=Hello+from+test'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        }),
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should include proper From and To fields in the request', async () => {
      const mockResponse = createMockMessageResponse();
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: IWhatsappSendMessageParams = {
        body: 'Test',
        to: '+15559876543',
      };

      await service.sendTextMessage(params);

      const postBody = httpService.post.mock.calls[0][1] as string;
      expect(postBody).toContain(
        `From=whatsapp%3A${encodeURIComponent(mockPhoneNumber)}`,
      );
      expect(postBody).toContain('To=whatsapp%3A%2B15559876543');
    });

    it('should use Base64 auth header from account SID and auth token', async () => {
      const mockResponse = createMockMessageResponse();
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: IWhatsappSendMessageParams = {
        body: 'Test',
        to: '+15551234567',
      };

      await service.sendTextMessage(params);

      const expectedAuth = `Basic ${Buffer.from(`${mockAccountSid}:${mockAuthToken}`).toString('base64')}`;
      const headers = httpService.post.mock.calls[0][2]?.headers as Record<
        string,
        string
      >;
      expect(headers.Authorization).toBe(expectedAuth);
    });

    it('should throw and log error when HTTP request fails', async () => {
      const networkError = new Error('ECONNRESET');
      httpService.post.mockReturnValue(throwError(() => networkError));

      const params: IWhatsappSendMessageParams = {
        body: 'Test',
        to: '+15551234567',
      };

      await expect(service.sendTextMessage(params)).rejects.toThrow(
        'ECONNRESET',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('sendMediaMessage', () => {
    it('should send a media message with URL', async () => {
      const mockResponse = createMockMessageResponse({ numMedia: '1' });
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: IWhatsappSendMessageParams = {
        body: 'Check out this image',
        mediaUrl: 'https://cdn.example.com/image.jpg',
        to: '+15551234567',
      };

      const result = await service.sendMediaMessage(params);

      expect(result).toEqual(mockResponse);
      const postBody = httpService.post.mock.calls[0][1] as string;
      expect(postBody).toContain('MediaUrl=');
      expect(postBody).toContain(
        encodeURIComponent('https://cdn.example.com/image.jpg'),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ hasMedia: true }),
      );
    });

    it('should send media message without mediaUrl', async () => {
      const mockResponse = createMockMessageResponse();
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: IWhatsappSendMessageParams = {
        body: 'Just text, no media',
        to: '+15551234567',
      };

      const result = await service.sendMediaMessage(params);

      expect(result).toEqual(mockResponse);
      const postBody = httpService.post.mock.calls[0][1] as string;
      expect(postBody).not.toContain('MediaUrl');
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ hasMedia: false }),
      );
    });

    it('should throw and log error when HTTP request fails', async () => {
      const apiError = new Error('Twilio API error');
      httpService.post.mockReturnValue(throwError(() => apiError));

      const params: IWhatsappSendMessageParams = {
        body: 'Test',
        mediaUrl: 'https://cdn.example.com/image.jpg',
        to: '+15551234567',
      };

      await expect(service.sendMediaMessage(params)).rejects.toThrow(
        'Twilio API error',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('sendTemplateMessage', () => {
    it('should send a template message successfully', async () => {
      const mockResponse = createMockMessageResponse();
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: IWhatsappSendTemplateParams = {
        templateSid: 'HX1234567890abcdef',
        to: '+15551234567',
      };

      const result = await service.sendTemplateMessage(params);

      expect(result).toEqual(mockResponse);
      const postBody = httpService.post.mock.calls[0][1] as string;
      expect(postBody).toContain('ContentSid=HX1234567890abcdef');
      expect(postBody).not.toContain('ContentVariables');
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messageSid: mockResponse.sid,
          templateSid: 'HX1234567890abcdef',
        }),
      );
    });

    it('should include ContentVariables when variables are provided', async () => {
      const mockResponse = createMockMessageResponse();
      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const params: IWhatsappSendTemplateParams = {
        templateSid: 'HX1234567890abcdef',
        to: '+15551234567',
        variables: { '1': 'John', '2': 'Order #123' },
      };

      await service.sendTemplateMessage(params);

      const postBody = httpService.post.mock.calls[0][1] as string;
      expect(postBody).toContain('ContentVariables');
    });

    it('should throw and log error when HTTP request fails', async () => {
      const apiError = new Error('Template not found');
      httpService.post.mockReturnValue(throwError(() => apiError));

      const params: IWhatsappSendTemplateParams = {
        templateSid: 'HXinvalid',
        to: '+15551234567',
      };

      await expect(service.sendTemplateMessage(params)).rejects.toThrow(
        'Template not found',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getMessageStatus', () => {
    it('should return message status successfully', async () => {
      const mockStatusResponse: IWhatsappMessageStatusResponse = {
        dateCreated: '2024-01-01T00:00:00Z',
        dateSent: '2024-01-01T00:00:01Z',
        dateUpdated: '2024-01-01T00:00:02Z',
        errorCode: null,
        errorMessage: null,
        sid: 'SM1234567890abcdef',
        status: 'delivered',
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: mockStatusResponse,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.getMessageStatus('SM1234567890abcdef');

      expect(result).toEqual(mockStatusResponse);
      expect(httpService.get).toHaveBeenCalledWith(
        `https://api.twilio.com/2010-04-01/Accounts/${mockAccountSid}/Messages/SM1234567890abcdef.json`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
          }),
        }),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messageSid: 'SM1234567890abcdef',
          status: 'delivered',
        }),
      );
    });

    it('should throw and log error when message is not found', async () => {
      const notFoundError = new Error('Message not found');
      httpService.get.mockReturnValue(throwError(() => notFoundError));

      await expect(service.getMessageStatus('SM_nonexistent')).rejects.toThrow(
        'Message not found',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should throw and log error on network failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Network timeout')),
      );

      await expect(
        service.getMessageStatus('SM1234567890abcdef'),
      ).rejects.toThrow('Network timeout');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});

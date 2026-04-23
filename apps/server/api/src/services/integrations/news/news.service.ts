import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class NewsService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get('NEWS_API_KEY') ?? '';
    this.apiUrl =
      this.configService.get('NEWS_API_URL') ||
      'https://newsapi.org/v2/everything';
  }

  async findLatestNews(topic: string): Promise<string[]> {
    const url = `${this.apiUrl}?q=${encodeURIComponent(topic)}&pageSize=5&apiKey=${this.apiKey}`;
    const logUrl = `${this.constructorName} findLatestNews`;

    try {
      const res = await firstValueFrom(this.httpService.get(url));
      this.loggerService.log(`${logUrl} success`, res.data);

      const articles = Array.isArray(res.data?.articles)
        ? res.data.articles
        : [];
      return articles
        .map((article: unknown) =>
          typeof article === 'object' &&
          article !== null &&
          'title' in article &&
          typeof article.title === 'string'
            ? article.title
            : undefined,
        )
        .filter(
          (title: string | undefined): title is string =>
            typeof title === 'string',
        );
    } catch (error: unknown) {
      this.loggerService.error(`${logUrl} failed`, error);
      return [];
    }
  }
}

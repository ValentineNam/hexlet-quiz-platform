import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url)
      throw new Error('DATABASE_URL обязателен при ENABLE_QUIZ_API=true.');
    try {
      const parsed = new URL(url);
      if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        !parsed.hostname ||
        !parsed.pathname ||
        parsed.pathname === '/'
      )
        throw new Error();
    } catch {
      throw new Error('DATABASE_URL должен быть корректным PostgreSQL URL.');
    }
    super({ datasources: { db: { url } }, log: [] });
  }
  async onModuleInit() {
    try {
      await this.$connect();
    } catch {
      throw new Error('Не удалось подключиться к PostgreSQL.');
    }
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT должен быть от 1 до 65535.');
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.configure(process.env.ENABLE_QUIZ_API === 'true'),
  );
  app.useBodyParser('json', { limit: '100kb' });
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
}
void bootstrap().catch(() => {
  console.error('API не запущен. Проверьте конфигурацию подключения к БД.');
  process.exitCode = 1;
});

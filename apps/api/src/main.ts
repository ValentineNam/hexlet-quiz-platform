import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { readPort, PortConfigurationError } from './startup-config';
import { installShutdownWatchdog } from './shutdown-watchdog';

async function bootstrap() {
  const port = readPort(process.env.PORT);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.configure(process.env.ENABLE_QUIZ_API === 'true'),
  );
  app.useBodyParser('json', { limit: '100kb' });
  const disposeWatchdog = installShutdownWatchdog();
  try {
    app.enableShutdownHooks();
    await app.listen(port, '127.0.0.1');
  } catch (error) {
    disposeWatchdog();
    throw error;
  }
}
void bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof PortConfigurationError
      ? error.message
      : 'API не запущен. Проверьте конфигурацию подключения к БД.',
  );
  process.exitCode = 1;
});

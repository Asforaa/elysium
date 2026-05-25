import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '2mb' });
  app.enableCors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || isAllowedDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin is not allowed: ${origin}`));
    },
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

function isAllowedDevOrigin(origin: string): boolean {
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u.test(origin)) {
    return true;
  }

  return /^https?:\/\/([a-z0-9-]+\.)?elysium\.localhost(?::\d+)?$/u.test(
    origin,
  );
}

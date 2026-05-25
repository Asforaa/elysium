import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  if (
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173'
  ) {
    return true;
  }

  return /^https?:\/\/([a-z0-9-]+\.)?elysium\.localhost(?::\d+)?$/u.test(
    origin,
  );
}

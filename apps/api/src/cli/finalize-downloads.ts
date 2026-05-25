import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DownloadJobsService } from '../download-jobs/download-jobs.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const service = app.get(DownloadJobsService);
    const results = await service.finalizeCompletedFiles();

    console.table(results);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Download finalization failed: ${message}`);
  process.exitCode = 1;
});

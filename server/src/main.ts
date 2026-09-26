import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureHttpSecurity } from './security/http-security';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureHttpSecurity(app);

  await app.listen(process.env.PORT ?? 8000);
}
void bootstrap();

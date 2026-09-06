import { config as loadEnvironment } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

const { json, urlencoded } = require('express');

loadEnvironment({ path: resolve(__dirname, '../.env'), override: true, quiet: true });

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Attachments are sent as base64 JSON; allow the 10 MB client limit plus encoding overhead.
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  const config = new DocumentBuilder()
    .setTitle('Enterprise AI Knowledge System API')
    .setDescription('Internal RAG knowledge base API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', name: 'X-Worker-Token', in: 'header' },
      'worker-token',
    )
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  // BACKEND_PORT adalah satu-satunya nama port backend (.env, docker-compose, script lokal).
  await app.listen(process.env.BACKEND_PORT ?? 8000, '0.0.0.0');
}
void bootstrap();


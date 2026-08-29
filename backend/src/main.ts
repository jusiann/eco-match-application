import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

function mergeOpenApiFragments(document: OpenAPIObject, logger: Logger): void {
  const docsDir = path.join(__dirname, 'docs');
  if (!fs.existsSync(docsDir)) {
    return;
  }

  const ymlFiles = fs.readdirSync(docsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  for (const file of ymlFiles) {
    try {
      const raw = fs.readFileSync(path.join(docsDir, file), 'utf8');
      const fragment = yaml.load(raw) as Partial<OpenAPIObject> | undefined;

      if (fragment?.paths) {
        document.paths = { ...document.paths, ...fragment.paths };
      }
      if (fragment?.components) {
        document.components = {
          ...document.components,
          schemas: { ...document.components?.schemas, ...fragment.components.schemas },
        };
      }
    } catch (err) {
      logger.error(`Error loading OpenAPI fragment ${file}:`, err as Error);
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.setGlobalPrefix('v1', {
    exclude: ['health', 'health/ready'],
  });

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // facility verification documents, max 10 MB
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('EcoMatch API')
    .setDescription('EcoMatch backend REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const logger = new Logger('Server');
  mergeOpenApiFragments(document, logger);

  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  const url = await app.getUrl();
  logger.log(`Application is running on: ${url}`);
  logger.log(`Swagger docs available at: ${url}/api/docs`);
}
bootstrap();

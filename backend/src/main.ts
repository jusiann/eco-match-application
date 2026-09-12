import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { IoAdapter } from '@nestjs/platform-socket.io';
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

  // Fastify'ın varsayılan JSON ayrıştırıcısı, "Content-Type: application/json var ama
  // gövde BOŞ" durumunu FastifyError ile reddediyor ve bu 500'e dönüşüyor. Gövdesiz
  // POST uçlarımız var (auth/refresh, auth/logout, matches/:id/accept,
  // admin/weights/:id/activate ...) ve tarayıcı istemcileri bu başlığı gövde olmasa
  // da göndermeye eğilimli -- en görünür sonucu, sayfa her yenilendiğinde
  // auth/refresh'in 500 alıp oturumu düşürmesiydi.
  //
  // Ayrıştırıcıyı DEĞİŞTİRMİYORUZ: Nest kendi 'application/json' ayrıştırıcısını
  // app.init() sırasında ekliyor ve Fastify aynı içerik türünün ikinci kez
  // eklenmesini FST_ERR_CTP_ALREADY_PRESENT ile reddediyor. Bunun yerine, gövdesi
  // olmadığı kesin olan isteklerde başlığı düşürüyoruz -- Content-Type yoksa Fastify
  // gövde ayrıştırma adımını hiç çalıştırmıyor. Gövdeli istekler etkilenmiyor,
  // bozuk JSON hâlâ normal 400 yolundan geçiyor.
  app.getHttpAdapter().getInstance().addHook('onRequest', (request, _reply, done) => {
    const contentType = request.headers['content-type'];
    if (!contentType?.startsWith('application/json')) {
      done();
      return;
    }

    const contentLength = request.headers['content-length'];
    const definitelyEmpty =
      contentLength === '0' || (contentLength === undefined && request.headers['transfer-encoding'] === undefined);

    if (definitelyEmpty) {
      delete request.headers['content-type'];
    }
    done();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // credentials:true ŞART -- refresh token'ı taşıyan httpOnly cookie (K-18) yalnızca
  // bununla çapraz-origin gönderilip alınabiliyor. Argümansız enableCors() varsayılan
  // olarak credentials'ı kapalı bırakıyor ve tarayıcı Set-Cookie'yi sessizce yok
  // sayıyor -- sonuç: sayfa her yenilendiğinde oturum kaybı.
  //
  // Origin yansıtmalı (origin: true) mod yalnızca geliştirme/Docker kolaylığı için;
  // üretimde CORS_ORIGINS'i virgülle ayrılmış bir liste olarak ayarlayın.
  // NOT: web/ konteyneri aynı origin üzerinden (nginx /v1'i backend'e proxy'liyor)
  // çalıştığı için orada CORS hiç devreye girmez -- bu ayar, frontend'i ayrı bir
  // portta `npm run dev` ile çalıştıran geliştirme akışı içindir.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins?.length ? corsOrigins : true,
    credentials: true,
  });

  app.useWebSocketAdapter(new IoAdapter(app)); // Faz 2.5: /v1/notifications/stream (Socket.IO)

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

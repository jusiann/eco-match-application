---
description: Proje konvansiyonlarına uygun yeni bir NestJS modülü oluştur
argument-hint: <modül adı, örn. materials>
---

Scaffold the NestJS module: **$ARGUMENTS**

## 1. Ground yourself first

- Read `backend/src/modules/auth/` end to end. It is the reference implementation —
  match its file layout, import style, and error handling.
- Read `docs/04-api-sozlesmesi.md` for the endpoints this module owns.
- Read `docs/06-senaryolar.md` for the scenario codes it must satisfy.
- Check `backend/prisma/schema.prisma` for the models it touches. If the tables do not
  exist yet, stop and say so — the migration comes first (`/migration`).

## 2. Create the files

Under `backend/src/modules/<name>/`, replacing the `.gitkeep` if present:

```
<name>.module.ts
<name>.controller.ts
<name>.service.ts
<name>.dto.ts
```

Add sub-services in the same folder when a service exceeds one clear responsibility
(e.g. `scoring.service.ts` alongside `matchmaking.service.ts`).

## 3. Follow the house rules

- **Controller:** thin. `@UseGuards(JwtAuthGuard)`, `@GetUser()` for the JWT payload,
  delegate to the service, return its result. No business logic, no Prisma calls.
- **Route prefix:** `@Controller('v1/<name>')`.
- **DTOs:** `class-validator` decorators with Turkish messages — they reach end users.
  The global `ValidationPipe` runs with `forbidNonWhitelisted`, so every accepted field
  must be declared.
- **Service:** injects `PrismaService`. Throws Nest HTTP exceptions with the project
  error shape: `{ error: 'MACHINE_CODE', message: 'Turkish explanation' }`.
- **Authorization:** most endpoints need more than a valid JWT. Check
  `docs/04-api-sozlesmesi.md` for the required role, and for whether the endpoint
  requires `facility.verified === true`.
- **Raw SQL:** anything touching `vector` or `geography` goes through
  `this.prisma.$queryRaw` with parameter binding. Never interpolate values into SQL.

## 4. Wire it up

- Register the module in `backend/src/app.module.ts`.
- Add an OpenAPI YAML file at `backend/src/docs/<name>.yml` and make sure `main.ts`
  merges it — currently `main.ts` only loads `auth.yml`, so extend that loader to read
  every `.yml` in the folder rather than adding a second hardcoded path.

## 5. Verify

```bash
npm --prefix backend run build
```

Then report: which endpoints now exist, which scenario codes they cover, and what is
still stubbed.

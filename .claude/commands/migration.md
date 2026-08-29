---
description: Elle yazılan SQL migration oluştur, uygula ve Prisma şemasını senkronla
argument-hint: <kısa açıklama, örn. "matches tablosuna expires_at ekle">
---

Create a hand-written SQL migration for: **$ARGUMENTS**

In this project, SQL migrations are the source of truth for the schema. Prisma is only
used for typed application queries. Follow this sequence exactly.

## 1. Read the target state first

- `docs/03-veri-modeli.md` — the intended table, column types, enums, and indexes
- `backend/prisma/migrations/` — what already exists, and the highest sequence number
- `backend/prisma/schema.prisma` — the current Prisma view of the world

Never invent a column shape. If `docs/03-veri-modeli.md` does not cover what is being
asked, say so and propose the addition to that document as part of the change.

## 2. Write the migration

Create `backend/prisma/migrations/NNN_<snake_case_name>.sql`, where `NNN` is the next
three-digit sequence number.

Rules:
- Idempotent where cheap: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Enum values are **lowercase snake_case**.
- UUID primary keys: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- Timestamps: `TIMESTAMP DEFAULT NOW()`.
- Money and mass: `NUMERIC`, never `FLOAT`. Mass is always in kilograms.
- Every foreign key gets an explicit `ON DELETE` rule — decide `CASCADE` vs `SET NULL`
  deliberately and note the reasoning in a SQL comment.
- Adding a value to an existing enum needs `ALTER TYPE ... ADD VALUE`, which cannot run
  inside a transaction block. Put it in its own migration file.
- Destructive statements (`DROP COLUMN`, `DROP TABLE`, type changes that lose data) must
  be called out to the user before applying, with the data-loss window described.

## 3. Apply it

Show the user the command; do not run destructive SQL unprompted.

```bash
psql "$DIRECT_URL" -f backend/prisma/migrations/NNN_<name>.sql
```

Use `DIRECT_URL`, not `DATABASE_URL` — the latter goes through the pooler.

## 4. Sync Prisma

Update `backend/prisma/schema.prisma` by hand to match the new SQL:
- `vector(768)` becomes `Unsupported("vector(768)")`
- `geography(Point, 4326)` becomes `Unsupported("geography(Point, 4326)")`
- Prisma enum members are UPPERCASE with `@map("lowercase_value")`
- Table and column names get `@@map` / `@map` to their snake_case SQL names

Then:

```bash
npm --prefix backend run prisma:generate
```

`npx prisma db pull` is a useful cross-check, but review its diff rather than accepting
it — it rewrites `Unsupported` columns and drops the `@map` names.

## 5. Verify

- `npx tsc --noEmit` inside `backend/` still passes
- Any query touching the changed tables still compiles
- If the change affects a documented endpoint, update `docs/04-api-sozlesmesi.md`
- If it affects the schema, update `docs/03-veri-modeli.md` in the same change

Report what changed, what you applied, and what the user still needs to run.

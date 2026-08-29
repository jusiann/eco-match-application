---
description: docs/06-senaryolar.md içindeki bir senaryoyu uçtan uca implemente et
argument-hint: <senaryo kodu, örn. S3 veya E7>
---

Implement scenario **$ARGUMENTS** end to end.

## 1. Load the scenario

Find the scenario in `docs/06-senaryolar.md` by its code. Read:
- the main flow, step by step
- the Gherkin acceptance criteria — these are the definition of done
- the endpoint table
- the linked business rules in `docs/05-is-kurallari.md`

If the code does not exist in `docs/06-senaryolar.md`, stop and ask. Do not guess at
what a scenario code means.

## 2. Check what already exists

- `backend/prisma/migrations/` — are the tables there?
- `backend/src/modules/` — is the owning module scaffolded?
- `docs/08-yol-haritasi.md` — which phase is this scenario in, and are its
  prerequisites done?

State any missing prerequisite before starting rather than half-building on top of it.

## 3. Build it

Work in this order, and keep each step reviewable:

1. Migration, if new tables or columns are needed (`/migration`)
2. Service logic, with the business rules from `docs/05-is-kurallari.md`
3. DTOs and validation, with Turkish messages
4. Controller endpoint, with the guard and role check from `docs/04-api-sozlesmesi.md`
5. OpenAPI YAML entry under `backend/src/docs/`
6. Tests named after the scenario code

## 4. Satisfy the acceptance criteria literally

Each Gherkin block maps to a test. Write them as
`describe('<CODE> <short name>')` with one `it` per scenario block, and use the exact
status codes and error messages from the document — the frontend is written against them.

Pay particular attention to the negative branches, which are where these scenarios carry
their value: duplicate submissions, wrong state transitions, missing permissions,
expired records, concurrent writes.

## 5. Report

Say which acceptance criteria now pass, which are covered by tests, and which parts of
the scenario are intentionally left out (for example anything depending on the AI service
or the frontend). If the implementation revealed a gap or contradiction in the scenario
document, propose the doc edit rather than silently diverging from it.

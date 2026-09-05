# syntax=docker/dockerfile:1

# pgvector/pgvector:pg16 = postgres:16-bookworm + the vector extension
# compiled in. pgcrypto already ships in that base image. PostGIS is the only
# extension missing for CLAUDE.md's "pgvector + PostGIS + pgcrypto" — added
# here via the PGDG apt repo the base image already has configured.
FROM pgvector/pgvector:pg16

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-postgis-3 \
    && rm -rf /var/lib/apt/lists/*

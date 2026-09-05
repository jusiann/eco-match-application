# syntax=docker/dockerfile:1

# Local development image. docker-compose.yml bind-mounts the source over this
# and runs `nest start --watch`; this is not a production/deploy image.
#
# Debian slim, not alpine: bcrypt and the Prisma engines ship prebuilt glibc
# binaries and are a pain to get working correctly against musl.
FROM node:20-bookworm-slim

WORKDIR /app

# openssl: Prisma's query engine links against libssl at runtime, and
# bookworm-slim doesn't ship it — absence turns into an obscure connection
# failure otherwise. procps: `nest start --watch` shells out to `ps` to find
# and restart the previous run's process on every file change; without it
# the container crashes on the first recompile instead of reloading.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl procps \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# prisma generate only reads schema.prisma to emit the client — it never
# connects to a database, so these placeholders just satisfy the datasource
# url format check. docker-compose.yml overrides both with the real values.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start:dev"]

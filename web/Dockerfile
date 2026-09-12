# syntax=docker/dockerfile:1

# İki aşamalı: Node ile statik export üretilir, çalışma zamanında yalnızca nginx kalır.
# next.config.ts `output: "export"` kullanıyor -- uygulama tamamen istemci tarafında
# çalışan tek sayfalık bir SPA, yani çalışma zamanında Node sunucusuna gerek yok.
# nginx hem statik dosyaları sunuyor hem de /v1, /health ve /socket.io'yu backend'e
# proxy'liyor (bkz. nginx/default.conf.template).

# ───────────────────────── 1) build ─────────────────────────
# Debian slim, alpine değil: Tailwind 4'ün oxide/lightningcss yerel ikilileri
# prebuilt glibc binary olarak geliyor, musl'a karşı derdi çıkarıyorlar.
# Backend Dockerfile'ı ile de aynı taban (node:20-bookworm-slim).
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* değerleri `next build` sırasında JS bundle'ına GÖMÜLÜR; imaj
# derlendikten sonra konteyner ortam değişkeniyle değiştirilemezler.
# "/" = same-origin modu (bkz. src/lib/api.ts): istekler göreli yol olarak gider
# (/v1/..., /health/ready, /socket.io/) ve hedefi çalışma zamanında nginx'in
# BACKEND_ORIGIN'i belirler. Böylece backend adresi değişince imajı yeniden
# derlemek gerekmiyor -- ayrıca CORS ve çapraz-origin cookie sorunu hiç oluşmuyor.
ARG NEXT_PUBLIC_API_URL=/
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ──────────────────────── 2) runtime ────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/out /usr/share/nginx/html
# nginx imajının giriş betiği /etc/nginx/templates/*.template dosyalarındaki
# ortam değişkenlerini envsubst'la doldurup /etc/nginx/conf.d/ altına yazıyor.
# FILTER olmadan $host, $request_uri gibi nginx değişkenleri de değerlendirme
# kapsamına girer -- yalnızca BACKEND_ ile başlayanlarla sınırlıyoruz.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

ENV BACKEND_ORIGIN=http://backend:3000 \
    NGINX_ENVSUBST_FILTER=^BACKEND_

EXPOSE 80

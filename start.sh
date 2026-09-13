#!/bin/bash
set -e

echo "==============================================================================="
echo "         EcoMatch Platformu - TEKNOFEST 2026 Teknik Doğrulama Ortamı"
echo "         Takım: VectorMatch (#1003771)  |  Sıfır Atık ve Döngüsel Ekonomi"
echo "==============================================================================="
echo ""

if ! command -v docker &> /dev/null; then
    echo "[HATA] Docker bulunamadı! Lütfen Docker motorunu kurun: https://docs.docker.com/engine/install/"
    exit 1
fi

echo "[1/3] Docker motoru kontrol ediliyor..."
if ! docker info &> /dev/null; then
    echo "[HATA] Docker servisi çalışmıyor. Lütfen docker servisini başlatın."
    exit 1
fi

echo "[2/3] EcoMatch mikroservisleri derleniyor ve ayağa kaldırılıyor..."
docker compose up -d --build

echo ""
echo "[3/3] Servisler hazır!"
echo "==============================================================================="
echo "  Web Arayüzü (Kullanıcı / Jüri) : http://localhost:8080"
echo "  API Swagger Dokümantasyonu      : http://localhost:8080/api/docs"
echo "  Backend Doğrudan Port          : http://localhost:3001"
echo "  AI Mikroservisi Port            : http://localhost:8000/docs"
echo "  Demo Giriş Şifresi              : Ecomatch2026!"
echo "==============================================================================="
echo ""
echo "Sistemi durdurmak için: docker compose down"

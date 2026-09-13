#!/bin/sh
# Konteyner giriş noktası: fine-tuned model yoksa üretir, varsa doğrudan servisi başlatır.
# "sh entrypoint.sh" olarak çağrılır (Dockerfile CMD) — dosyanın +x biti olmasa da çalışır,
# çünkü bind-mount (./:/app) Windows'tan klonlanan dosyaların execute bitini taşımayabilir.
set -e

MODEL_DIR="./fine_tuned_model"
CONFIG_FILE="$MODEL_DIR/config.json"
WEIGHTS_FILE="$MODEL_DIR/model.safetensors"

if [ -s "$CONFIG_FILE" ] && [ -s "$WEIGHTS_FILE" ]; then
    echo "[entrypoint] Mevcut fine-tuned model bulundu ($MODEL_DIR) — egitim atlaniyor, mevcut model kullaniliyor."
else
    echo "[entrypoint] Fine-tuned model bulunamadi/eksik — python fine_tune.py ile uretiliyor (ilk acilista ~5 dakika surebilir)..."
    if ! python fine_tune.py; then
        echo "[entrypoint] HATA: fine_tune.py basarisiz oldu. Konteyner durduruluyor (orijinal modele SESSIZCE dusulmuyor)." >&2
        exit 1
    fi
    if [ ! -s "$WEIGHTS_FILE" ]; then
        echo "[entrypoint] HATA: fine_tune.py sifir hata ile cikti ama $WEIGHTS_FILE olusmadi. Konteyner durduruluyor." >&2
        exit 1
    fi
    echo "[entrypoint] Model egitimi tamamlandi: $MODEL_DIR"
fi

echo "[entrypoint] uvicorn baslatiliyor (0.0.0.0:8000)..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000

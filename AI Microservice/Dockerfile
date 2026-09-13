# syntax=docker/dockerfile:1

# Local development image. docker-compose.yml bind-mounts the source over
# this and runs uvicorn directly; this is not a production/deploy image.
#
# Pinned to 3.12, not the newer 3.14: sentence-transformers==3.1.0 pins
# numpy<2.0, and numpy's pre-2.0 releases have no prebuilt wheel for 3.14 --
# pip falls back to a source build that needs a C compiler we don't ship
# here. Don't bump this without re-checking that numpy pin.
FROM python:3.12-slim-bookworm

WORKDIR /app

# libgomp1: torch's CPU backend links against it at import time; slim
# doesn't ship it (missing -> "libgomp.so.1: cannot open shared object file").
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CPU-only torch build first, from PyTorch's own index -- the default PyPI
# linux wheel pulls a full CUDA toolkit as separate pip packages (nvidia-*,
# triton) even with no GPU to use it, ballooning the image ~8GB+ for nothing.
# Once this is satisfied, the plain requirements.txt install below sees
# torch's version constraint already met and won't touch it again.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Windows'tan klonlanırsa execute biti kaybolabilir; CMD yine de "sh entrypoint.sh"
# ile interpreter üzerinden çağırdığı için bu satır olmasa da çalışır — savunma amaçlı.
RUN chmod +x entrypoint.sh

EXPOSE 8000

CMD ["sh", "entrypoint.sh"]

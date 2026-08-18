# AI Engineer service — Milestone M0: reproducible local environment.
# Build:  docker compose build
# Run:    docker compose run --rm ai ask "Berapa maksimal biaya hotel Manager?"
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first so this layer is cached across rebuilds.
# Core engine runs on the Python stdlib only; pypdf adds PDF support.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application source (see .dockerignore).
COPY . .

# No ENTRYPOINT here: docker-compose defines it so
# `docker compose run ai <args>` == `python ai_engine.py <args>`.
CMD ["python", "ai_engine.py", "--help"]

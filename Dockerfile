FROM python:3.11-slim

WORKDIR /app

# System deps for SQLCipher and sqlite-vec
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    libsqlcipher-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# Data dir for SQLite volume
RUN mkdir -p /data

ENV DB_PATH=/data/northos.db
ENV DB_ENCRYPTION=false
ENV APP_ENV=prod

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

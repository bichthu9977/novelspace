# TruyenFullVn Docker Production Stack

This stack runs:

- FastAPI app
- PostgreSQL 16 with persistent volume
- Redis 7 with persistent append-only data
- Nginx reverse proxy

## 1. Prepare environment

```bash
cp .env.docker.example .env.docker
nano .env.docker
```

Change all secrets before deployment:

- `POSTGRES_PASSWORD`
- `DATABASE_URL` must match `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`
- `SECRET_KEY`
- `ADMIN_TOKEN`
- `SITE_URL`

## 2. Start services

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f app
```

## 3. Local smoke test

FastAPI direct:

```bash
curl http://127.0.0.1:8000/api/health
```

Nginx:

```bash
curl http://127.0.0.1/api/health
```

## 4. HTTPS

`nginx.conf` includes an HTTPS-ready server block. Keep it commented until certificates exist.

Expected mounted certificate paths:

```text
deploy/certs/fullchain.pem
deploy/certs/privkey.pem
```

After certificates are available, uncomment the HTTPS server block in `nginx.conf` and reload:

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

## 5. Persistence

PostgreSQL data is stored in Docker volume:

```text
postgres_data
```

Redis data is stored in:

```text
redis_data
```

Backups should still be configured separately with `scripts/backup.sh`; Docker volumes are not a replacement for backups.

## 6. Scaling app workers

For more FastAPI containers behind Nginx:

```bash
docker compose up -d --scale app=2
```

If scaling, remove the direct app port mapping `127.0.0.1:8000:8000` from `docker-compose.yml` or keep only one app instance.

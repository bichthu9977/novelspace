# TruyenFullVn PostgreSQL Backup Cron

This guide sets up daily compressed PostgreSQL backups on the VPS.

## 1. Install tools

```bash
sudo apt update
sudo apt install -y postgresql-client gzip
```

## 2. Copy scripts on the VPS

Recommended location:

```bash
sudo mkdir -p /opt/truyenfullvn/scripts
sudo cp scripts/backup.sh /opt/truyenfullvn/scripts/backup.sh
sudo cp scripts/restore.sh /opt/truyenfullvn/scripts/restore.sh
sudo chmod +x /opt/truyenfullvn/scripts/backup.sh /opt/truyenfullvn/scripts/restore.sh
```

## 3. Create backup and log folders

```bash
sudo mkdir -p /var/backups/truyenfullvn/postgres
sudo mkdir -p /var/log/truyenfullvn
sudo chown -R "$USER":"$USER" /var/backups/truyenfullvn /var/log/truyenfullvn
chmod 700 /var/backups/truyenfullvn/postgres
```

## 4. Configure database access

Preferred: use `DATABASE_URL`.

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DB_NAME'
```

Alternative: use standard PostgreSQL variables.

```bash
export PGHOST='127.0.0.1'
export PGPORT='5432'
export PGUSER='USER'
export PGDATABASE='DB_NAME'
export PGPASSWORD='PASSWORD'
```

Optional settings:

```bash
export BACKUP_DIR='/var/backups/truyenfullvn/postgres'
export LOG_DIR='/var/log/truyenfullvn'
export RETENTION_DAYS='14'
export BACKUP_PREFIX='truyenfullvn_postgres'
```

## 5. Test backup manually

```bash
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DB_NAME' \
BACKUP_DIR='/var/backups/truyenfullvn/postgres' \
LOG_DIR='/var/log/truyenfullvn' \
RETENTION_DAYS='14' \
/opt/truyenfullvn/scripts/backup.sh
```

Check output:

```bash
ls -lh /var/backups/truyenfullvn/postgres
tail -n 50 /var/log/truyenfullvn/postgres-backup.log
```

## 6. Add daily cron job

Open crontab:

```bash
crontab -e
```

Run backup every day at 03:20 server time:

```cron
20 3 * * * DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DB_NAME' BACKUP_DIR='/var/backups/truyenfullvn/postgres' LOG_DIR='/var/log/truyenfullvn' RETENTION_DAYS='14' /opt/truyenfullvn/scripts/backup.sh >> /var/log/truyenfullvn/postgres-backup-cron.log 2>&1
```

If the password contains `%`, escape it as `\%` in cron.

## 7. Restore from a backup

List backups:

```bash
ls -lh /var/backups/truyenfullvn/postgres
```

Restore with confirmation prompt:

```bash
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DB_NAME' \
/opt/truyenfullvn/scripts/restore.sh /var/backups/truyenfullvn/postgres/truyenfullvn_postgres_YYYYMMDDTHHMMSSZ.sql.gz
```

Non-interactive restore for emergency automation:

```bash
RESTORE_CONFIRM=yes \
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DB_NAME' \
/opt/truyenfullvn/scripts/restore.sh /var/backups/truyenfullvn/postgres/truyenfullvn_postgres_YYYYMMDDTHHMMSSZ.sql.gz
```

## Notes

- Backups are compressed with `gzip -9`.
- Old backups are deleted by `RETENTION_DAYS`.
- Logs are written to `postgres-backup.log` and `postgres-restore.log`.
- Keep `/var/backups/truyenfullvn/postgres` private because dumps contain user data.

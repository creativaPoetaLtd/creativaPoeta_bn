# MongoDB security, deletion and recovery runbook

This document defines the production controls for Creativa Poeta. Secrets and full
MongoDB connection strings must never be committed, pasted in tickets, screenshots,
or stored in the repository.

## 1. Separation of database credentials

Use four different Atlas database users. Never reuse one credential for several roles.

| Environment variable | Purpose | Minimum access | Permanent? |
| --- | --- | --- | --- |
| `MONGO_URI` | Normal application runtime | Read, insert and update only on the application database. No remove, drop collection, drop database, user or role administration. | Yes |
| `MONGO_PURGE_URI` | Explicit permanent purge from the protected trash | Read/write on the application database. | No: inject only for a supervised purge, then remove/rotate |
| `MONGO_MIGRATION_URI` | Controlled schema/index migration | Temporary read/write and index administration on the application database. | No: remove after migration |
| `MONGO_BACKUP_URI` | `mongodump` backup | Read-only on the application database | Yes, store only on the backup host |

The Atlas built-in `readWrite` role includes physical deletion. It must therefore not
be used by the normal `MONGO_URI` runtime user. Create a custom Atlas role for runtime
with only the actions the application needs (read/find, insert and update, plus the
minimum collection metadata access Atlas requires). Keep `MONGO_AUTO_INDEX=false` in
production so the runtime user does not need index administration.

Recommended Atlas procedure:

1. Open **Security > Database Access > Custom Roles**.
2. Create `cpRuntimeSafe` scoped only to the Creativa Poeta database.
3. Add only read/find, insert and update privileges. Do not add `remove`,
   `dropCollection`, `dropDatabase`, role administration or user administration.
4. Create `creativapoeta_runtime` with this custom role and replace `MONGO_URI` in
   Vercel Production.
5. Create `creativapoeta_purge` with `readWrite` scoped only to the application
   database. Keep it outside Vercel; inject `MONGO_PURGE_URI` only during an
   approved permanent-purge window, redeploy, purge, then remove the variable and
   rotate or disable that database user.
6. Create `creativapoeta_backup` with the built-in `read` role scoped only to the
   application database. Store it only on the computer that performs backups.
7. Create a migration user only when needed. Give it `readWrite` plus the minimum
   database-administration rights needed to rebuild indexes; revoke or delete it after
   `npm run migrate:soft-delete` succeeds.
8. Use unique, long generated passwords and rotate each independently.

After changing a Vercel variable, redeploy Production and test login, form creation,
update, soft deletion, restoration and permanent purge separately.

## 2. Application deletion model

- Normal admin deletion is a soft delete in the original collection. The record gets
  `isDeleted`, deletion time, actor and reason metadata.
- Standard reads and aggregations automatically exclude deleted records.
- Active uniqueness uses partial indexes (`isDeleted: false`), so a new active record
  may reuse the identity of an archived record.
- Restore runs validation and can be blocked when an active duplicate now exists.
- Only the incognito protected authority, or an explicitly delegated trash custodian,
  can list archived records, restore them or inspect security history.
- Permanent purge requires both protected portal authorization and the independent
  `MONGO_PURGE_URI`. It cannot use the normal runtime connection.
- The security audit collection is append-only at application level. Audit snapshots
  redact secrets and large/binary payloads. Rollback restores only safe fields and
  never restores credentials, tokens, HTML, binary data or deletion metadata.

Run the one-time migration with a temporary migration credential:

```powershell
$env:MONGO_MIGRATION_URI = "<temporary migration connection string>"
npm run migrate:soft-delete
Remove-Item Env:MONGO_MIGRATION_URI
```

Do not run this command with `MONGO_URI`. Check the migration output before removing
the temporary Atlas user.

## 3. API protections

Production should define:

```text
MONGO_AUTO_INDEX=false
SECURITY_RATE_LIMIT_SALT=<a separate long random secret>
CORS_ORIGINS=https://creativapoeta.com,https://www.creativapoeta.com,https://be.creativapoeta.com,https://fr.creativapoeta.com,https://nl.creativapoeta.com
```

The backend applies exact-origin CORS checks, request validation, authenticated role
checks, mutation rate limits and audit attribution. The in-process limiter is only a
defence-in-depth control on serverless instances; Vercel Firewall or another shared
edge rate limiter should also protect authentication and public form endpoints.
Critical trash actions use a persistent MongoDB-backed limiter and fail closed when
its secret or datastore is unavailable. Restore and rollback write their security
audit event in the same MongoDB transaction as the protected record mutation.

## 4. Automated local backup

MongoDB Atlas automated cloud backup is not available for a Free cluster. A Flex
cluster includes daily snapshots; an M10+ dedicated cluster supports configurable
Cloud Backup, and continuous backup can provide point-in-time restore.
Until then, run encrypted off-site dumps as a second layer. Even after upgrading, keep
an independent export because provider backup and operator-error recovery are different
failure domains.

Prerequisites:

- Install MongoDB Database Tools (`mongodump` and `mongorestore`).
- Create a dedicated Atlas read-only backup user.
- Create a protected directory outside the repository, preferably in an encrypted
  OneDrive/Personal Vault location.
- Do not put credentials in the scheduled-task command line or script file. Store them
  as user-scoped protected environment variables on the backup account.

Generate the 64-byte encryption/authentication key once. Copy it to a password
manager or another offline recovery location before using it. Do not store the only
copy on the backup computer; losing it makes every `.cpbak` file unrecoverable.

```powershell
$keyBytes = New-Object byte[] 64
$keyGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $keyGenerator.GetBytes($keyBytes) } finally { $keyGenerator.Dispose() }
[Convert]::ToBase64String($keyBytes) | Set-Clipboard
```

Example interactive backup:

```powershell
$env:MONGO_BACKUP_URI = "<read-only backup connection string>"
$env:CP_MONGO_BACKUP_DIR = "C:\Users\deogr\OneDrive\CP-Secure-Backups\MongoDB"
$env:CP_MONGO_BACKUP_RETENTION_DAYS = "35"
$env:CP_MONGO_BACKUP_ENCRYPTION_KEY_BASE64 = "<64-byte Base64 key>"
powershell -ExecutionPolicy Bypass -File .\scripts\Backup-Mongo.ps1
```

Persist the required values for the dedicated Windows backup account, then
register the hardened daily task once:

```powershell
[Environment]::SetEnvironmentVariable("MONGO_BACKUP_URI", "<read-only backup connection string>", "User")
[Environment]::SetEnvironmentVariable("CP_MONGO_BACKUP_DIR", "C:\Users\deogr\OneDrive\CP-Secure-Backups\MongoDB", "User")
[Environment]::SetEnvironmentVariable("CP_MONGO_BACKUP_RETENTION_DAYS", "35", "User")
[Environment]::SetEnvironmentVariable("CP_MONGO_BACKUP_ENCRYPTION_KEY_BASE64", "<64-byte Base64 key>", "User")
powershell -ExecutionPolicy Bypass -File .\scripts\Register-MongoBackupTask.ps1 -RunAt "02:30"
```

The task runs only under that Windows user, reads no secret from its command line,
starts missed runs when the computer becomes available and retries transient failures.
After registration, execute one manual run and inspect both the task exit code and the
three generated files (`.cpbak`, `.cpbak.sha256`, `.cpbak.manifest.json`).

The script writes an unencrypted dump only as an owner-only temporary file, encrypts
it with AES-256-CBC and authenticates the entire encrypted file with HMAC-SHA256,
then removes every plaintext temporary file. It publishes the completed `.cpbak`
atomically and writes a SHA-256 checksum and JSON manifest. It prunes only matching
backup files older than the configured retention period. Schedule it
daily in Windows Task Scheduler under the protected backup account and alert on every
non-zero exit code.

Before trusting the automation, run the offline cryptographic self-test. It verifies
both an exact encryption/decryption round trip and rejection of a tampered archive:

```powershell
& .\scripts\Test-MongoBackupCrypto.ps1
& .\scripts\Test-SecurityPreflight.ps1
```

Check that the latest completed backup exists, is recent, and still matches its
checksum and manifest:

```powershell
& .\scripts\Test-MongoBackupHealth.ps1 -MaxAgeHours 36
```

Recommended retention:

- daily: 35 days;
- monthly: 12 months (copy one validated daily archive to a separate monthly folder);
- annual: according to legal/accounting obligations and data-retention policy.

Backups contain personal data. Restrict NTFS/OneDrive access, enable MFA, disk
encryption and version history, and never share the backup folder with normal staff.

## 5. Mandatory restore drill

A backup is not considered valid until a restore test succeeds. Use a completely
isolated test database whose name begins with `cp_restore_test_`:

```powershell
$env:MONGO_RESTORE_TEST_URI = "mongodb+srv://<isolated-test-host>/"
$env:MONGO_RESTORE_TEST_USERNAME = "<isolated restore user>"
$env:MONGO_RESTORE_TEST_PASSWORD = "<restore password>"
$env:CP_MONGO_BACKUP_ENCRYPTION_KEY_BASE64 = "<same 64-byte Base64 key>"
$env:CONFIRM_ISOLATED_RESTORE = "yes"
powershell -ExecutionPolicy Bypass -File .\scripts\Test-MongoRestore.ps1 `
  -ArchivePath "C:\Users\deogr\OneDrive\CP-Secure-Backups\MongoDB\creativa-poeta-YYYYMMDD-HHMMSS.cpbak" `
  -SourceDatabase "creativaPoeta_db" `
  -TargetDatabase "cp_restore_test_YYYYMM"
```

The restore URI must contain no credentials. The script gives `mongorestore` the
password through standard input so it is absent from the process command line. The
restore script authenticates the encrypted archive before decrypting it, checks the
outer SHA-256 checksum and refuses broad or production-looking target database names.
Run this drill monthly, verify collection counts and a sample of critical records,
then remove the isolated test database through a separately approved maintenance
procedure.

## 6. Production activation gate

Do not consider the protection active until all checks below pass:

1. Run the soft-delete/index migration using only `MONGO_MIGRATION_URI`.
2. Replace production `MONGO_URI` with the restricted runtime user.
3. Set `MONGO_AUTO_INDEX=false` and `MONGO_ENFORCE_SAFE_RUNTIME_ROLE=true`.
4. Redeploy and run `npm run security:verify-runtime`; it must report no destructive
   or administrative privileges.
5. Verify login, form creation, record update, soft deletion and protected restore.
6. Create a real encrypted dump, run `Test-MongoBackupHealth.ps1`, then complete an
   isolated restore drill.
7. Remove the migration credential and ensure no purge or backup credential remains
   in the normal runtime environment.

## 7. Disaster recovery checklist

1. Freeze application writes and preserve logs.
2. Determine whether the incident is operator error, compromised credentials, logical
   corruption or Atlas outage.
3. Revoke compromised runtime, purge, migration and backup credentials independently.
4. Prefer protected-trash restoration for a small number of deleted records.
5. For broad corruption, restore the latest known-good Atlas snapshot or verified dump
   to a new database/cluster; never overwrite production first.
6. Validate users, requests, referrals, messages, indexes and audit history in isolation.
7. Point a staging deployment at the restored database and run smoke tests.
8. Switch production only after approval, then rotate every secret and document the
   recovery point objective (RPO) and recovery time objective (RTO).

Official references:

- MongoDB Atlas database users: https://www.mongodb.com/docs/atlas/security-add-mongodb-users/
- MongoDB built-in roles: https://www.mongodb.com/docs/manual/reference/built-in-roles/
- Atlas Cloud Backup: https://www.mongodb.com/docs/atlas/backup/cloud-backup/overview/
- `mongodump`: https://www.mongodb.com/docs/database-tools/mongodump/
- `mongorestore`: https://www.mongodb.com/docs/database-tools/mongorestore/

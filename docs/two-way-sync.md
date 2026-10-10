# CRM and website backend synchronization

Status on 2026-10-10: backend safety foundation implemented; full domain integration and production activation are pending. No production database was changed. Attempts to back up the locally configured website and CRM databases failed with connection errors. The local CRM configuration disables the website integration and has no website API token.

## Current integration audit

| Area | Existing behavior | Work required for complete synchronization |
| --- | --- | --- |
| Countries, universities, programs, scholarship catalogue, website content | CRM uses website APIs; website IDs and language variants are retained | Add explicit revision checks to every mutable entity and complete deletion impact checks across both databases |
| Students and staff | Account provisioning/linking exists; native CRM projections retain local IDs | Map all profile fields and extension fields; reconcile existing identities explicitly; retain separate login/security policies |
| Admissions and documents | Status, assignment, journey, visa and private document actions exist | Reconcile CRM follow-up fields with website fields; retain file/review/version history and validate relationships |
| Invoices and payments | Source invoices and verified payment receipts have dedicated bridges | Review all accounting transitions and local payment edits; never mirror balances, receipts or wallet movements as ordinary JSON writes |
| Services, housing, arrival, consultations and support | Corresponding source actions are available from CRM | Complete version checks and domain adapters for concurrent updates, assignments and deletion impact |
| Tasks, reminders, calls, reports, attendance, payroll and CRM follow-up | Some fields remain CRM-only | Add domain adapters and authorized website backend operations; preserve CRM business rules and privacy |
| Accounts, roles, sessions and integration secrets | Authentication remains separate | Explicit account identity/role mapping; credential material is excluded from generic synchronization |
| Messaging and private files | Existing gateways enforce source permissions; mail connector is not configured | Provider integration and access-controlled file adapters; no copying signed URLs or widening access |
| Shared CRM storage | Single app-state document and derived read models; process-local mutation queue | Add storage revision/transaction protection across app state, catalogue and read models before running multiple CRM writers |

The generic sync engine has **no registered production domain adapters**. The CRM readiness endpoint reports `automaticSyncActive: false` and `domainAdaptersComplete: false`. It must stay inactive until the above adapters and storage protections are complete.

## Implemented safeguards

- Deterministic identities and operation IDs. Existing records are not joined by name, email or phone.
- Three-way nested field merging against a previous checkpoint. Conflicting scalar or array changes retain both versions for review.
- Mongo-backed durable jobs, retained operation history/checkpoints, and a distributed worker lease. A lost HTTP response retries the same idempotent operation.
- Incomplete manifests cannot enqueue new operations. Missing records and tombstones produce deletion reviews; they never delete another record automatically.
- Private website extension protocol at `/api/crm/sync/:companyId/records`, restricted to the configured company and an authenticated website administrator. Source website collections are not overwritten by this protocol.
- Website extension writes and operation history commit in one MongoDB transaction. An outdated revision returns 409. Reusing an operation ID for different content returns 409.
- Private extensions exclude passwords, tokens and secret fields. Original account, payment and file operations continue through their validated APIs.
- Extension models/collections initialize only after activation flags and verified backups pass. No database setup occurs for this feature while disabled.
- CRM failed mutations operate on a clone; rejected writes invalidate the cache and cannot leak uncommitted edits into later requests. This does not provide a distributed lock for all existing CRM writers.

## Backup before any live writes

The read-only tool exports BSON documents, collection options and indexes, including GridFS collections, using a consistent snapshot session. It checks each file's SHA-256 and document framing/count. It imports neither backend startup nor startup migrations.

Run from the website repository. Use fresh output directories outside Git and protect their access: they contain personal information and password hashes from the original databases.

```powershell
node server/scripts/backup-database.cjs server/.env C:\private-backups\website-current
node server/scripts/backup-database.cjs D:\international-educational\eduglobal-crm\server\.env C:\private-backups\crm-current
node server/scripts/backup-database.cjs --verify C:\private-backups\website-current
node server/scripts/backup-database.cjs --verify C:\private-backups\crm-current
node server/scripts/backup-database.cjs --receipt C:\private-backups\website-current C:\private-backups\crm-current C:\private-backups\receipt.json
```

The server backup gate verifies both manifests and all referenced files before sync starts. Both exports and the receipt must be available on a private filesystem accessible to the server. A failed export never produces a verified receipt. Retain the originals and test restoration on an isolated database before any data migration. A checksum check alone does not prove restoration of the full production deployment.

Website backend settings for the private extension protocol:

```dotenv
CRM_TWO_WAY_SYNC_ENABLED=false
CRM_SYNC_COMPANY_ID=company-default
SYNC_BACKUP_RECEIPT_FILE=
```

Keep the first value `false` during the audit and adapter work. Setting it to `true` enables only the guarded private extension protocol; it does not activate a full CRM synchronization worker. No environment variable currently activates an automatic two-way worker.

## Verification performed

Pure tests cover independent/concurrent edits, ambiguous identities, array conflicts, deletion review, incomplete responses, duplicate identities, retry after a lost response, failed mutation rollback and corrupted/missing backup files.

An isolated local MongoDB replica-set test exercises real BSON exports, backup verification, extension transactions, simultaneous revision writes, same-operation retry, operation history, administrator/company isolation, blocked deletion and distributed worker leasing. Existing CRM integration tests and original website account/admissions/finance integration tests also pass. No live writes, production restore, deployment or cross-cluster end-to-end test has been performed.

## Remaining activation sequence

1. Restore connectivity to the intended databases and identify the actual deployment API credentials through private configuration.
2. Export, verify and restore-test both backups. Freeze domain migration during this baseline.
3. Complete adapters for every area in the audit table; add revision handling to existing controllers and storage CAS/transactions to CRM writers.
4. Produce a complete baseline inventory and explicit identity links. Retain ambiguous records as conflicts; preserve all old data.
5. Run dry reconciliation, resolve approved conflicts and review deletion relationships on both sides. New deletions require recoverable tombstones and a reviewed impact plan.
6. Test addition/update/removal and concurrency for each domain against two isolated databases, including failure/restart/retry cases and per-role permissions.
7. Enable the worker after those checks; monitor pending/conflicting jobs and verify reconciliation. Production deployment has not been performed as part of this change.

# Private GCS operational verification — 2026-10-17

Private GCS storage is operational locally and verified without exposing public attachment access.

Started from clean `development` at
`cff82b61aba123788006c4d93fbdf96c7621b9eb`, matching the locally recorded
`origin/development`. No fetch, commit, staging or push was performed.

## Configuration and identity

The existing `storage.config.ts` and provider factory define these exact settings:

| Variable | Contract / configured local value |
| --- | --- |
| `STORAGE_PROVIDER` | Exact `local` (default) or `gcs`; configured `gcs`. |
| `GCS_BUCKET_NAME` | Required for GCS; `enterprise-service-files-22`. |
| `GCS_PROJECT_ID` | Optional SDK project override; explicitly set to `enterprise-service-511905`. |
| `ATTACHMENT_STORAGE_DIR` | Local provider only; defaults to `.attachments`. |

The ignored, untracked `server/.env` already selected GCS and the intended bucket;
the explicit project ID was added. No credentials were added. Both root and server
ignore rules cover `.env`; `git check-ignore -v server/.env` resolves to
`server/.gitignore:5`. `start:dev` and `storage:check` explicitly use Node's
`--env-file-if-exists=.env` from `server/`. Inherited shell variables take precedence.
Plain `start`, `start:debug` and `start:prod` do not load that file automatically;
provide their environment explicitly. Restart an existing development server to
load changed values.

Local setup uses the existing `gcloud auth application-default login` credentials
outside the repository, with quota project `enterprise-service-511905`.
The actual SDK client was `UserRefreshClient`; Google's token-info endpoint
confirmed the developer's Google email (reported in the task result). This was
verified independently of `gcloud auth list`. The user-info endpoint returned 403;
token-info succeeded. No tokens or credential documents were printed or copied.
No `GOOGLE_APPLICATION_CREDENTIALS` override or storage emulator was configured.
There are no application-specific credential/key settings: authentication uses
the official SDK's [ADC discovery](https://docs.cloud.google.com/docs/authentication/application-default-credentials).

The dedicated deployed identity is
`enterprise-service-storage@enterprise-service-511905.iam.gserviceaccount.com`.
Production should attach this service account or use workload identity, without
developer ADC or a long-lived service-account JSON key. The local probe used the
developer account; it does **not** validate service-account runtime authentication.

## Live read-only cloud inspection

Only the specified project and bucket were inspected. `gcloud projects describe`
returned project number `65041526185`, matching the configured bucket's JSON API
`projectNumber` read through the backend SDK and ADC.

| Check | Observed result |
| --- | --- |
| Project | `enterprise-service-511905` |
| Bucket | `enterprise-service-files-22`, STANDARD, US-CENTRAL1 |
| Public access prevention | `enforced` |
| Uniform bucket-level access | Enabled |
| `allUsers` | Absent from bucket and project IAM policies |
| `allAuthenticatedUsers` | Absent from bucket and project IAM policies |
| Dedicated service-account bucket grant | `roles/storage.objectUser` (Storage Object User), unconditional |
| Dedicated service-account project grants | None; no Owner, Editor or Storage Admin |
| Project hierarchy | No organization/folder parent returned; no ancestor grants to inspect |
| Project policy | One Owner binding for the developer user, not the service account; no group bindings |
| Soft delete | 604800 seconds (seven days) |
| Retention/versioning | No retention policy or versioning configuration returned |

Default project convenience principals are separate from the runtime account:
`projectOwner:enterprise-service-511905` and
`projectEditor:enterprise-service-511905` have `roles/storage.legacyBucketOwner`
and `roles/storage.legacyObjectOwner`; `projectViewer:enterprise-service-511905`
has `roles/storage.legacyBucketReader` and `roles/storage.legacyObjectReader`.
These are not dedicated service-account grants. No IAM, ACL, retention, public
access or uniform-access settings were changed.

The adapter uses object create/get/delete. The existing predefined
[Storage Object User role](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)
also includes additional object permissions; it is not a custom three-permission role.
No broader role was requested or granted.

Inspection commands used the explicit project/bucket:

```sh
gcloud storage buckets describe gs://enterprise-service-files-22 --project=enterprise-service-511905 --format=json
gcloud storage buckets get-iam-policy gs://enterprise-service-files-22 --project=enterprise-service-511905 --format=json
gcloud projects get-iam-policy enterprise-service-511905 --format=json
gcloud projects describe enterprise-service-511905 --format='json(projectId,projectNumber,parent)'
```

## Smoke probe and cleanup

From `server/`, `pnpm.cmd storage:check` loaded `.env` and passed against real GCS.
The adapter generated one opaque UUID object under `attachments/`, containing only
the harmless fixed bytes `Service Desk storage check`. No ticket/user data or
database writes were involved. Upload used `ifGenerationMatch: 0` and CRC32C
validation; download validated CRC32C and the command compared the complete bytes.
Deletion ran in `finally`.

The only runtime-code change adds a read after deletion to verify absence. It
accepts only the adapter's missing-object exception or local `ENOENT`, and fails
on permission/network errors or a still-readable object. Actual output:

```text
Storage upload/read/content-match/delete check passed; probe absence confirmed
```

The live probe was removed. The unchanged seven-day
[soft-delete policy](https://docs.cloud.google.com/storage/docs/soft-delete)
can retain a recoverable copy until expiry; this is not a claim of immediate
permanent erasure. A failed delete can still leave a private probe requiring
operator cleanup. No public/anonymous object read or bucket-policy mutation was
needed: public denial was checked through prevention settings and IAM inspection.

## Authorization and fail-closed behavior

Source review and focused tests confirm the existing architecture:

- Uploads go through authenticated backend multipart endpoints and validation.
- Image/video previews and downloads call the authenticated
  `/tickets/attachments/:attachmentId/download` API, then use browser blob URLs.
- The backend rechecks parent ticket/support visibility and attachment/parent
  tombstones before reading storage. Employee access to internal notes is denied.
- ADMIN/SUPER_ADMIN receive no operational access from administration roles;
  requester access to their own tickets remains valid. Internal notes require
  current support responsibility.
- API attachment projections exclude storage keys/digests. No public/signed GCS
  URLs, original-filename object names, object ACLs or direct browser-to-GCS access
  were introduced. Download privacy/security headers remain intact.
- Original ticket files stay immutable. Communication deletion retains author,
  current-cycle and transaction rules; tombstones commit before physical cleanup.

Provider construction rejects invalid providers and missing/invalid GCS bucket
configuration, including `NODE_ENV=production`. The CLI returns exit 1 with its
safe configuration/ADC/bucket-access message and explicitly reports no fallback.
An omitted provider still defaults to local by the existing contract; production
must explicitly select `gcs`. Missing `GCS_PROJECT_ID` alone is valid because the
SDK can discover a project. Credentials/reachability are checked on storage use,
not by remote I/O during startup. Selected GCS never falls back to local.

## Focused verification

| Check | Result |
| --- | --- |
| Server `pnpm.cmd lint` | Passed, zero warnings |
| Server `pnpm.cmd typecheck` | Passed |
| Server `pnpm.cmd build` | Passed |
| `google-cloud-storage.spec.ts`, `attachment-storage.spec.ts`, `video-validation.spec.ts` | 3 suites / 53 tests passed |
| `attachments.e2e-spec.ts`, `tickets-authorization.e2e-spec.ts` | 2 suites / 151 tests passed |
| Real GCS `storage:check` | Passed, including confirmed live-object absence |
| Isolated temporary local `storage:check` | Passed; directory empty afterward |
| Production provider missing/invalid bucket and invalid provider checks | Failed closed as expected |
| Production CLI with missing bucket | Exit 1, no fallback, as expected |
| `git diff --check` | Passed |

PostgreSQL tests used existing local `eds_stabilization_test` with 27 applied
migrations. The test environment forced local storage and used isolated fixtures;
no GCS calls or development data mutations occurred in those tests. Expected
failure-injection logs and existing pg/experimental-VM warnings appeared; suites
passed. PowerShell blocked the `pnpm.ps1` shim, so checks used `pnpm.cmd`.
Sandboxed Google calls were blocked; permitted external runs completed without
changing machine policy or copying credentials.

## Remaining scope and working tree

Production workload identity and complete deployed application uploads/previews
remain untested. No live-GCS ticket/user data was submitted, and no browser/client
checks were run because frontend code did not change. No full repository regression,
AI integration, cloud provisioning or deployment was performed.

Provider selection does not migrate existing local attachment bytes. Existing
local-only binaries, if any, need a separately authorized copy/verification before
they can be read from GCS; this task did not inspect or migrate real attachments.

Changed existing tracked files: `README.md`, `status.md`, `docs/decision.md`,
`docs/demo-deployment-plan.md`, `server/.env.example`, `server/src/storage-check.ts`.
New documentation: `docs/gcs-storage-verification.md`. Local ignored config:
`server/.env` only. Build output remains ignored. All source changes are unstaged.
No credential files/keys were created, no secrets were committed, and no commit
or push was made.

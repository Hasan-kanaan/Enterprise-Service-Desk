# Server runtime dependency remediation - 2026-09-27

## Before updates

Fresh `pnpm audit --prod --json`: **11 high / 5 moderate / 1 low**, 17 advisory entries across six transitive packages. Counts are not a measure of application exploitability. All original findings and complete chains are below; optional Prisma CLI peers are included by pnpm production audit.

| Package / original version | Severity | Advisory | Vulnerable range | First patched range | Complete original paths | Remediation / resulting version / final status |
| --- | --- | --- | --- | --- | --- | --- |
| uuid 9.0.1 | moderate | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | `<11.1.1` | `>=11.1.1` | `.>@google-cloud/storage>gaxios>uuid`<br>`.>@google-cloud/storage>google-auth-library>gaxios>uuid`<br>`.>@google-cloud/storage>google-auth-library>gcp-metadata>gaxios>uuid`<br>`.>@google-cloud/storage>google-auth-library>gtoken>gaxios>uuid` | Scoped gaxios override; major 9.0.1 to 11.1.1; resolved |
| multer 2.1.1 | high | [GHSA-72gw-mp4g-v24j](https://github.com/advisories/GHSA-72gw-mp4g-v24j) | `>=1.0.0 <2.2.0` | `>=2.2.0` | `.>@nestjs/core>@nestjs/platform-express>multer`<br>`.>@nestjs/platform-express>multer` | Compatible Nest 11.2.6 parent update; minor 2.1.1 to 2.4.0; resolved |
| multer 2.1.1 | moderate | [GHSA-3p4h-7m6x-2hcm](https://github.com/advisories/GHSA-3p4h-7m6x-2hcm) | `>=2.0.0-alpha.1 <2.2.0` | `>=2.2.0` | `.>@nestjs/core>@nestjs/platform-express>multer`<br>`.>@nestjs/platform-express>multer` | Compatible Nest 11.2.6 parent update; minor 2.1.1 to 2.4.0; resolved |
| fast-uri 3.1.3 | high | [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) | `>=3.0.0 <=3.1.3` | `>=3.1.4` | `.>@prisma/client>prisma>@prisma/dev>@prisma/streams-local>ajv>fast-uri` | Compatible lockfile patch 3.1.3 to 3.1.8; resolved |
| fast-uri 3.1.3 | high | [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7) | `>=3.0.0 <3.1.5` | `>=3.1.5` | `.>@prisma/client>prisma>@prisma/dev>@prisma/streams-local>ajv>fast-uri` | Compatible lockfile patch 3.1.3 to 3.1.8; resolved |
| deepmerge-ts 7.1.5 | high | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | `<8.0.0` | `>=8.0.0` | `.>@prisma/client>prisma>@prisma/config>deepmerge-ts` | Scoped Prisma config override; major 7.1.5 to 8.0.0; resolved |
| mysql2 3.15.3 | high | [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) | `<3.22.0` | `>=3.22.0` | `.>@prisma/client>prisma>mysql2` | Scoped Prisma CLI override; minor 3.15.3 to 3.23.1; resolved |
| qs 6.15.3 | moderate | [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) | `>=6.14.2 <=6.15.3` | `>=6.15.4` | `.>@nestjs/core>@nestjs/platform-express>express>body-parser>qs`<br>`.>@nestjs/core>@nestjs/platform-express>express>qs`<br>`.>@nestjs/platform-express>express>body-parser>qs`<br>`.>@nestjs/platform-express>express>qs` | Compatible lockfile minor 6.15.3 to 6.16.0; resolved |
| qs 6.15.3 | moderate | [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | `>=2.2.5 <6.16.0` | `>=6.16.0` | `.>@nestjs/core>@nestjs/platform-express>express>body-parser>qs`<br>`.>@nestjs/core>@nestjs/platform-express>express>qs`<br>`.>@nestjs/platform-express>express>body-parser>qs`<br>`.>@nestjs/platform-express>express>qs` | Compatible lockfile minor 6.15.3 to 6.16.0; resolved |
| fast-uri 3.1.3 | high | [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8) | `>=3.1.3 <3.1.6` | `>=3.1.6` | `.>@prisma/client>prisma>@prisma/dev>@prisma/streams-local>ajv>fast-uri` | Compatible lockfile patch 3.1.3 to 3.1.8; resolved |
| fast-uri 3.1.3 | high | [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc) | `>=3.0.0 <3.1.6` | `>=3.1.6` | `.>@prisma/client>prisma>@prisma/dev>@prisma/streams-local>ajv>fast-uri` | Compatible lockfile patch 3.1.3 to 3.1.8; resolved |
| fast-uri 3.1.3 | high | [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf) | `>=3.1.2 <3.1.6` | `>=3.1.6` | `.>@prisma/client>prisma>@prisma/dev>@prisma/streams-local>ajv>fast-uri` | Compatible lockfile patch 3.1.3 to 3.1.8; resolved |
| fast-uri 3.1.3 | high | [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp) | `>=3.0.0 <3.1.6` | `>=3.1.6` | `.>@prisma/client>prisma>@prisma/dev>@prisma/streams-local>ajv>fast-uri` | Compatible lockfile patch 3.1.3 to 3.1.8; resolved |
| mysql2 3.15.3 | moderate | [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) | `<=3.23.0` | `>=3.23.1` | `.>@prisma/client>prisma>mysql2` | Scoped Prisma CLI override; minor 3.15.3 to 3.23.1; resolved |
| multer 2.1.1 | high | [GHSA-wc9g-mqfw-jrwm](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm) | `<2.3.0` | `>=2.3.0` | `.>@nestjs/core>@nestjs/platform-express>multer`<br>`.>@nestjs/platform-express>multer` | Compatible Nest 11.2.6 parent update; minor 2.1.1 to 2.4.0; resolved |
| multer 2.1.1 | low | [GHSA-qvfw-j98x-7q72](https://github.com/advisories/GHSA-qvfw-j98x-7q72) | `<2.3.0` | `>=2.3.0` | `.>@nestjs/core>@nestjs/platform-express>multer`<br>`.>@nestjs/platform-express>multer` | Compatible Nest 11.2.6 parent update; minor 2.1.1 to 2.4.0; resolved |
| multer 2.1.1 | high | [GHSA-535w-7cp7-47q4](https://github.com/advisories/GHSA-535w-7cp7-47q4) | `<2.3.0` | `>=2.3.0` | `.>@nestjs/core>@nestjs/platform-express>multer`<br>`.>@nestjs/platform-express>multer` | Compatible Nest 11.2.6 parent update; minor 2.1.1 to 2.4.0; resolved |

## Ownership and reachability review before updates

No implicated direct dependency is obsolete or unused. Nest platform-express supplies FilesInterceptor in server/src/tickets/attachment-upload.interceptor.ts; core boots the application. GCS is imported by google-cloud-storage.ts and must stay. PrismaService imports the generated client, whose generated/prisma/internal/class.ts imports @prisma/client/runtime/client; absence of direct application imports does not make @prisma/client removable. @prisma/adapter-pg supplies the PostgreSQL runtime adapter. prisma is correctly a development dependency for generation, validation and migration commands. Its optional peer edge from @prisma/client makes its tooling dependencies appear in the production lockfile audit; no dependency is moved or peer edge removed to conceal findings.

Multer accepts authenticated attacker-controlled multipart field names before DTO validation. File, field, part and rate limits mitigate volume but do not fix its parser/cleanup bugs. No custom async fileFilter is configured, reducing relevance of the low-severity race advisory. qs is in Express/body-parser request parsing and merits patching. GCS gaxios uses uuid.v4() without caller-provided buffers (build/src/gaxios.js); the reported v3/v5/v6 buffer defect is not that call path, but the vulnerable package remains installed. Prisma CLI fast-uri (AJV), mysql2, and deepmerge-ts are tooling paths, not HTTP request handlers: application data access uses PostgreSQL through adapter-pg. Prisma config loads a repository-owned TS config and disables remote config extension. No HTTP route invokes prisma dev, MySQL or configuration merging. These distinctions reduce current exposure, not the validity of the advisories.

## Selected remediation

All 17 original runtime findings are resolved. Both applications pass the exact CI command, `pnpm audit --prod --audit-level high`, with **zero known vulnerabilities**. CI severity and advisory visibility are unchanged; there are no exceptions or suppressions.

| Package | Before | After | Reason |
| --- | --- | --- | --- |
| @nestjs/common, @nestjs/core, @nestjs/platform-express | 11.1.27 | 11.2.6 | Compatible minor parent update brings patched Multer; keep framework packages aligned |
| @nestjs/testing (development) | 11.1.27 | 11.2.6 | Match the runtime framework |
| multer | 2.1.1 | 2.4.0 | Parent's exact supported dependency; all five reported advisories fixed |
| qs | 6.15.3 | 6.16.0 | Compatible minor within Express/body-parser ranges |
| fast-uri | 3.1.3 | 3.1.8 | Compatible patch within AJV's range; all six URI advisories fixed |
| uuid under gaxios 6.7.1 | 9.0.1 | 11.1.1 | First patched major line retaining CommonJS support |
| deepmerge-ts under @prisma/config 7.10.0 | 7.1.5 | 8.0.0 | First patched major line |
| mysql2 under prisma 7.10.0 | 3.15.3 | 3.23.1 | First minor release covering both advisories |
| sqlstring / seq-queue under mysql2 | 2.3.3 / 0.0.5 | Removed; sql-escaper 1.5.2 added | Upstream mysql2 dependency change |
| concat-stream / typedarray under Multer | 2.0.0 / 0.0.6 | Removed | Upstream Multer dependency change |

All other package versions are retained from the incoming lockfile. Peer snapshot identifiers change where Nest versions change and mysql2 adds its Node types peer. Prisma client, adapter, CLI and engines remain **7.10.0**; GCS remains **8.2.0**. No package replacement, unused direct dependency removal or unresolved no-fix advisory was necessary. The original range/first-patched column above is advisory-specific; the chosen version covers every finding for that package.

### Three narrowly scoped overrides

`server/pnpm-workspace.yaml` is the pnpm 11 home for settings (package.json's old pnpm.overrides field is ignored). It applies only to the independent server package; no root workspace or Prisma ownership is reintroduced. Compatible qs and fast-uri fixes are ordinary lockfile resolutions, without persistent overrides.

- `gaxios@6.7.1>uuid: 11.1.1`: registry metadata still has GCS 8.2.0 as its newest release, using gaxios ^6.0.2 and google-auth-library ^9.6.3; gaxios 6.7.1 still requests uuid ^9.0.1. Updating a direct parent cannot fix this within its supported range. The sole gaxios UUID call is CommonJS `v4()` for a multipart boundary, without arguments or output buffers. uuid 11.1.1 retains that API and CommonJS exports. The advisory concerns v3/v5/v6 buffers ([CVE-2026-41907](https://github.com/advisories/GHSA-w5hq-g745-h8pq)); no vulnerable buffer call was found on this path. The offline dependency test uses real GCS-resolved gaxios to serialize multipart data through an intercepting adapter, so it tests the override without credentials, DNS or GCS requests. Remove the override when GCS/auth resolve a gaxios release with a patched UUID dependency.
- `@prisma/config@7.10.0>deepmerge-ts: 8.0.0`: no newer 7.10.x CLI/config patch was available. [Version 8 release notes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) identify Map-value merging, type helper renames and deepmergeInto behavior changes. The inspected Prisma config loader dynamically imports only `deepmerge`, passes it to c12 and uses this repository's plain-record config; it does not use Maps or the changed APIs. The compatibility test checks merging and input preservation through the actual parent resolution; Prisma validate/generate/status/diff exercise the real loader. This fixes [CVE-2026-40345](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). Remove when a compatible Prisma config release depends on deepmerge-ts >=8.0.0; do not widen this override to other consumers.
- `prisma@7.10.0>mysql2: 3.23.1`: CLI pins 3.15.3 exactly. Updating within mysql2 major 3 fixes both reports without changing Prisma major/minor. MySQL is not this application's database adapter; real PostgreSQL commands/tests validate the Prisma paths used here. MySQL connections are not exercised or claimed as validated. Remove when a compatible Prisma CLI release pins mysql2 >=3.23.1.

These are explicit compatibility decisions, not evidence that arbitrary future major overrides are safe. Reassess them whenever either parent version changes. Engine requirements fit Node 24.12.0. The server-local settings explicitly allow the existing Prisma CLI runtime-version check, Prisma engine installation and unrs-resolver native setup scripts; no blanket build-script allowance is introduced. A clean frozen install verifies these decisions without interactive approval.

### Preserved upload behavior

Multer 2.4 now implements inclusive file-size and part limits internally. Removed the application's old Busboy `+1` compensation: fileSize is exactly 10 MiB and parts is six (one JSON payload plus five files). This preserves the existing valid boundary and HTTP 413 rejection above it. The existing real multipart e2e cases verify both boundaries, five-file acceptance and invalid-file rejection. StorageAdapter, authorization, lifecycle and business rules are unchanged; no database migration or schema edit is needed.

### Verification

Final verification on Node 24.12.0 / pnpm 11.9.0:

- Clean server install with `pnpm --dir server install --frozen-lockfile`: passed; temporary old node_modules removed. Final frozen install also passed after adding the compatibility-test script.
- Backend `pnpm lint`: **0 errors / 0 warnings**; `pnpm typecheck` and `pnpm build`: passed.
- `pnpm test --runInBand`: **203/203 tests, 16/16 suites**. `pnpm test:dependencies`: **2/2 offline compatibility tests**, also added to CI.
- PostgreSQL `pnpm test:e2e --runInBand` equivalent Node command: **260/260 tests, 10/10 suites** against existing `eds_stabilization_test`; storage forced local. Expected injected-error logs and existing pg/VM warnings remain, not lint warnings.
- Frontend `pnpm lint`: **0 errors / 0 warnings**; `pnpm build` (TypeScript plus Vite): passed.
- `pnpm --dir client test:browser`: **4/4 suites, 60/60 emitted PASS groups**: employee 21, operations 19, administration 6, sessions 14; no browser runtime errors reported. Browser tests use API fixtures; database coverage is the separate e2e run.
- Prisma `validate` / `generate` with `--config prisma7.config.ts`: passed. `migrate status` and `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` passed on both `enterprise_service_desk` and `eds_stabilization_test`: **18 applied migrations each, zero drift**. No migration applied or created by this remediation.
- Server and client `pnpm audit --prod --audit-level high`: **exit 0, zero known vulnerabilities of any severity**.
- `git diff --check`: passed.

Initial verification detected the Multer boundary change described above (259/260 e2e); the complete rerun passes after preserving the original limits. A temporary clean-install backup was initially inside the TypeScript scan and caused build errors; it was moved out and removed, and both checks passed. The first browser run failed a timing-sensitive operations request-log assertion; the complete rerun without simultaneous database tests passed without changing browser or application logic. The first compatibility test used Prisma's non-runtime package entry; it now resolves the actual `prisma/config` entry and passes. These failed attempts are not counted as passing runs.

No business behavior changed: the small interceptor adaptation preserves the existing upload contract. No AI work, Google Cloud configuration, real GCS access, deployment, commit or push. README installation guidance now identifies the required existing server-local pnpm settings file; root/client ownership is unchanged.

### Development tooling remains visible

The complete (non-prod) audits still report server **14 high / 1 moderate** and client **4 high / 1 moderate**. These are development-tooling findings outside this runtime remediation, not a clean all-dependency scan. The unchanged informational CI audit continues to display them. No broad tooling updates or severity reductions were made. Server findings below include one representative development chain per advisory/version; the runtime scan reports none.

| Package / version | Severity | Advisory | Representative development path |
| --- | --- | --- | --- |
| brace-expansion 2.1.1 | high | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | `.>jest>@jest/core>@jest/reporters>glob>minimatch>brace-expansion` |
| brace-expansion 1.1.15 | high | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | `.>@eslint/eslintrc>minimatch>brace-expansion` |
| brace-expansion 1.1.15 | high | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | `.>@eslint/eslintrc>minimatch>brace-expansion` |
| brace-expansion 2.1.1 | high | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | `.>jest>@jest/core>@jest/reporters>glob>minimatch>brace-expansion` |
| brace-expansion 5.0.7 | high | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | `.>@nestjs/cli>glob>minimatch>brace-expansion` |
| brace-expansion 5.0.7 | high | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | `.>@nestjs/cli>glob>minimatch>brace-expansion` |
| brace-expansion 2.1.1 | high | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | `.>jest>@jest/core>@jest/reporters>glob>minimatch>brace-expansion` |
| brace-expansion 1.1.15 | high | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | `.>@eslint/eslintrc>minimatch>brace-expansion` |
| js-yaml 3.15.0 | high | [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | `.>jest>@jest/core>@jest/reporters>@jest/transform>babel-plugin-istanbul>@istanbuljs/load-nyc-config>js-yaml` |
| js-yaml 4.3.0 | high | [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | `.>@eslint/eslintrc>js-yaml` |
| browserslist 4.28.4 | high | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | `.>@nestjs/cli>fork-ts-checker-webpack-plugin>webpack>browserslist` |
| browserslist 4.28.4 | high | [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | `.>@nestjs/cli>fork-ts-checker-webpack-plugin>webpack>browserslist` |
| baseline-browser-mapping 2.10.40 | moderate | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | `.>@nestjs/cli>fork-ts-checker-webpack-plugin>webpack>browserslist>baseline-browser-mapping` |
| js-yaml 3.15.0 | high | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | `.>jest>@jest/core>@jest/reporters>@jest/transform>babel-plugin-istanbul>@istanbuljs/load-nyc-config>js-yaml` |
| js-yaml 4.3.0 | high | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | `.>@eslint/eslintrc>js-yaml` |

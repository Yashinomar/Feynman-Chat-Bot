# TeachBack pilot repair verification

The requested `outputs/repository-analysis.md` was absent from this checkout. This report comes from reading the current routes, schema, and study flows and testing the changed behavior.

## Findings checked against source

Confirmed: PUT session mass assignment and cross-user mutation; unowned expensive endpoints; unbounded or unchecked model/input data; uploaded notes indexed under a timestamp rather than the saved session; volatile notes and signaling state; numeric millisecond review dates sent to Prisma; unchecked client writes; malformed AI output and false fact-check approval on missing evidence; short predictable room codes; audio payload/model error gaps; weak registration constraints; stale README/Node instructions; tracked SQLite data. The root SQLite file had no records. The Prisma SQLite file had account and study records with password hashes. They are preserved privately under `.private/pre-repair/` and removed from the working tree. The accounts cannot be classified as real versus test without owner knowledge. Git history still contains both database files. No rewrite or credential reset was performed.

Disproved/qualified: session GET and DELETE already checked ownership, but their separate lookup and mutation patterns were simplified to scoped operations. AI mock fallbacks did not make the service safe for pilot use; they could display fabricated success. Serverless deployment was mentioned in code comments, but SQLite, volatile room maps and notes made that deployment unsuitable; the supported pilot target is one persistent Node server.

## Repairs and behavior verified

Scoped authorization and strict schemas cover session CRUD, messages, AI, RAG, hints, quiz, fact-check, transcription, and room signaling. Authentication checks live account existence; registration uses bounded usernames/passwords, a production invitation code, and persistent login throttles. Requests have bounded streaming JSON parsing and persistent quotas. Chat uses server-owned history and one transaction for both messages, mastery, spaced review and version advancement. Duplicate request IDs recover committed turns. RAG chunks and vectors live in SQLite under the owned session; upload creates that session, and chat retrieves ranked passages after reload. Fact checking returns accurate, inaccurate, or unverified. UI retains drafts on failed saves and shows upload, PDF, audio, and network errors. Rooms use cryptographic IDs, participant-scoped writes, bounded state, and expiry. The speech runtime uses the supported Transformers.js 3.8 line with a patched Sharp override; native import succeeds on this Intel Mac. Model-loading and transcription failure paths are covered by controlled mocks.

Tests use isolated migrated SQLite databases and controlled Gemini/speech mocks. They cover two-user authorization, invalid and oversized requests, notes upload→chat retrieval, persisted score and DateTime review fields, retry and rollback, room membership/expiry, audio bounds, and UI failure handling.

## Limits and decisions

No live Gemini key was available, so model quality and live provider response shapes were not verified. No downloaded Whisper model or two-device network call was exercised; native import and mocked speech failure/recovery were checked. A TURN server may be needed across restrictive networks. SQLite requires a single persistent server and private backups. The original account records were not migrated into the new schema. Production registration remains closed until `REGISTRATION_CODE` is supplied. The remaining npm audit findings are eight moderate advisories in the ESLint toolchain. Review history removal and affected-account credential resets with the repository owner before publication.

## Commands

Use Node 22.23.4 or supported Node 24. `npm ci`, copy `.env.example` to `.env`, set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `GEMINI_API_KEY`, and for production `REGISTRATION_CODE`. Then `npm run db:migrate`, `npm run dev` for development or `npm run build && npm start` for the one-server pilot. `npm run lint`, `npm run typecheck`, and `npm test` verify the code. The build may need the matching optional Next SWC binary on the build machine; this sandbox needed a direct fetch because npm installed that optional package without its binary.

## Final local check results (Node 22.23.4)

- `npm test`: 8 files, 53 tests passed after the final speech retry change.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; all 17 static pages generated and API routes compiled.
- Native `@huggingface/transformers` import: passed on this Intel Mac. The full model download/inference remains untested without external model assets.
- `git diff --check`: passed.
- `npm audit`: eight moderate toolchain advisories remained after patched Sharp override; no high or critical advisories.

## Local sign-up correction and running state

After local launch, browser sign-up at 127.0.0.1 was rejected because AUTH_URL was localhost. The origin check now accepts these two loopback spellings on the same port only when the configured URL and request are loopback; cross-site origins and other ports still fail. Three dedicated origin tests pass, and a temporary account completed sign-up and sign-in through the running app; that test account was then removed. The complete suite now passes 56 tests across 9 files. Lint and type checking pass after this correction. The last successful production build preceded this small origin change.

The development server uses a fresh migrated SQLite database and a private .env file. There is no Gemini key in the local environment, so AI requests remain unavailable until one is configured. The local database exists and is ignored. Both original tracked database paths have been removed from the Git index while the live database file remains on disk. Those deletions are staged for review, but no commit was made. Git history still contains the originals.

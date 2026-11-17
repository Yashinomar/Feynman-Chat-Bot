# TeachBack AI

A study app for learning by explaining, with saved study sessions, ordered topic pathways, uploaded notes, quizzes, personas, spaced review, speech transcription, and two-person WebRTC rooms. New sessions generate a level-adjusted path from the main idea through ordered subtopics. The tutor stays on the current step, gives feedback or one focused question, and advances after a clear explanation. The path and progress are saved with the session. Creating a path requires GEMINI_API_KEY.

## Development setup

Use Node 22.23.4 (`nvm install && nvm use`). Node 18 and the original Node 20.18 runtime are unsupported by the dependencies.

```sh
npm ci
cp .env.example .env
openssl rand -base64 32
```

Put the generated private value in `AUTH_SECRET` in `.env`. Set `DATABASE_URL="file:./dev.db"`, `AUTH_URL="http://localhost:3000"`, and your `GEMINI_API_KEY`. Never commit credentials. Prisma resolves relative SQLite paths against `prisma/`. Both Next and Prisma load `.env`.

```sh
npm run db:migrate
npm run dev
```

Open http://localhost:3000 and register. Usernames have 3–32 letters, digits or underscores; passwords need at least 12 characters and at most 72 UTF-8 bytes. Set `REGISTRATION_CODE` for a private class invitation; production registration is closed without this setting. No default administrator or seeded accounts are installed.

## Pilot deployment

Use one long-running Node server, HTTPS, and a persistent private disk. Set DATABASE_URL to an absolute SQLite path on that disk. Back up the database securely. Uploaded passage text and embeddings, study progress, room state, and quotas are stored there. Do not deploy this SQLite design on ephemeral serverless instances or multiple replicas. Configure the reverse proxy to replace forwarded client-address headers before setting TRUST_PROXY=true; otherwise authentication limits use a conservative shared server bucket.

```sh
npm ci
npm run db:migrate
npm run build
npm start
```

Provide the production variables through the service environment. Set AUTH_URL to the HTTPS public origin and AUTH_SECRET to a private random secret. AI features return an unavailable error when GEMINI_API_KEY is missing; fake mastery scores are never returned. Google receives submitted study text and notes for generation/embedding. Local speech inference can be disabled with `TRANSCRIPTION_ENABLED=false`; otherwise it downloads model files on first use and needs adequate memory, outbound model-download access, and a persistent model cache. Rooms expire after two hours; WebRTC uses STUN and some networks will require a separately configured TURN service.

Limits include 200 sessions per account, bounded message/document text, 5MiB/50-page client PDF extraction, 60-second mono 16kHz audio, per-action rate limits and aggregate AI daily quotas (200 per account, 2000 per deployment). Put matching request/body/time limits on the reverse proxy. Scanned PDFs require OCR before upload.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests use temporary databases and controlled AI/audio mocks; they do not prove live provider quality or real cross-network WebRTC connectivity. See outputs/ for current repair evidence. Do not assume readiness until all checks are recorded as passing.

## Sensitive historical data

The original checkout tracked SQLite files; one contained account and study records. They were moved to ignored `.private/pre-repair/` backups without printing records. New development starts with an empty migrated database. Old records and password hashes remain in Git history. History removal and any affected-account password resets require the repository owner's decision and have not been performed. Do not copy old databases into the new schema or publish local backups.
# Administrator and course authoring

From this project folder, run `npm run db:migrate` and then `npm run admin:create`.
The second command prompts for a new administrator username and a hidden password
(at least 12 characters, maximum 72 UTF-8 bytes), followed by confirmation. It stores
only a bcrypt hash, refuses to overwrite existing accounts, and never grants admin
access through public registration. Keep the password private.

Start the app and open `/admin/login` to sign in. The admin center supports courses,
ordered lessons and sublessons, draft saving, student preview, publishing, and
unpublishing. Draft edits do not change the student-visible version until published.
Concurrent edits are rejected with a recovery message rather than overwritten.
The **Courses** navigation item opens published reading at `/courses`. Students can
start a separate AI teach-back on a lesson topic. This does not yet track completion
of authored lessons or evaluate answers against the teacher's complete lesson text.

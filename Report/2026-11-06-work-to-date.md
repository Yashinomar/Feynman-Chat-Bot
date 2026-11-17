# TeachBack AI engineering report — work to date

**Date:** November 6, 2026

**Repository:** `Yashinomar/Feynman-Chat-Bot`

**Status:** Changes are local and uncommitted. The development website responded with HTTP 200 at `http://127.0.0.1:3000` when this report was written.

## Work completed

The repository was cloned into the Feyman workspace. I read the README, Prisma schema, API routes, authentication setup, main study and multiplayer flows, and project instructions. The requested `outputs/repository-analysis.md` did not exist in the checkout, so findings were verified directly against the source.

### Account access and request safety

- Session reads, updates, deletes, and message writes are scoped to the signed-in owner. `PUT /api/sessions/[id]` no longer passes arbitrary request data to Prisma; it accepts only intended fields. The admin endpoint checks the account's current role.
- AI, notes, quiz, hint, fact-check, transcription, and signaling routes require appropriate account or room access. Request bodies, text, audio, room state, and model responses are bounded and validated. Persistent limits restrict repeated and costly requests.
- Registration validates usernames and password length, hashes passwords, and supports a class registration code. Authentication requires a private secret and limits repeated login attempts. Production registration is closed without a class code.
- A local sign-up failure was traced to `localhost` and `127.0.0.1` being treated as different origins. The origin check now permits those two loopback names on the same port while continuing to reject outside origins. A temporary account successfully registered and signed in through the running app, then was removed.

### Learning flow and uploaded notes

- Upload now creates one owned database session and stores all note passages and embeddings under its ID. Chat retrieves relevant passages from persistent storage, including after a database reconnect. Empty or incomplete ingestion fails without advertising a usable session.
- A chat turn saves the student's message, AI reply, mastery score, review date, and session version in one database transaction. A failed AI response or write does not produce a displayed saved success. Request IDs support safe retry after an uncertain network response. Review dates use valid Prisma `DateTime` values.
- Tutor, hint, quiz, and fact-check model outputs are validated. Fact-check results distinguish accurate, inaccurate, and unverified; missing source material is not treated as proof of accuracy. The interface retains a draft when saving fails and shows useful errors for unreadable or scanned PDFs.
- New solo and uploaded-notes sessions receive a topic-specific learning path. The first step is the basic idea, followed by ordered subtopics. Lower Primary, High School, and Professional settings create four, five, and six total steps respectively and affect the tutor's level of questioning. The tutor focuses on the current step, moves on after a clear explanation, and does not ask another question about a completed step. The path and current position persist across reloads. Existing sessions receive a conservative ordered fallback path. The interface shows the path and completion state.
- Path advancement now requires the model's completion decision and score to agree: `stepComplete` must be true and the score must be at least 70. A high score paired with an incomplete decision cannot skip a step. Generated paths reject repeated titles and objectives after case and whitespace normalization.

### Multiplayer, speech, and setup

- Signaling rooms use strong server-generated codes, participant-specific permissions, bounded candidate and session data, persistent SQLite state, and expiry. The room interface handles disconnections and signaling failures more clearly.
- Transcription checks sample rate, duration, sample values, payload size, model-loading failures, concurrency, and timeouts. The speech library was moved to a version that imports on this Intel Mac, with a patched transitive image library.
- Prisma migrations, a safe local migration command, a private environment template, PDF worker setup, and revised Node/deployment instructions were added. The supported pilot target is one Node server with HTTPS and a persistent private SQLite disk. The README describes the required variable names without storing credentials.

## Data handling

The two SQLite files that arrived in the repository were inspected using aggregate metadata only. One was empty; the other contained account and study records, including password hashes. Their original local copies were preserved in ignored `.private/pre-repair/` backups. The live development database is also ignored. Removal of both old database paths from Git tracking is staged, but **their contents still exist in Git history**. No history rewrite, credential reset, or migration of those old accounts has been performed; those decisions belong to the repository owner. No database contents or secrets are included here.

## Verification performed

- **69 tests across 10 files passed** on the final integrated state, up from the prior 62-test checkpoint. They cover two-user authorization, invalid input, upload-to-chat passage retrieval, saved mastery and review dates, rollback/retry behavior, room access, audio failure handling, pathway progression and completion, and client error handling.
- The focused learning-path suite passed **12/12 tests**, and the focused study integration suite passed **10/10 tests**. The deterministic pathway matrix covers vague, off-topic, contradictory, below-threshold, threshold, strong, incomplete final-step, and passing final-step evaluations. It also checks normalized duplicate titles and objectives.
- **Lint, TypeScript checking, the production build, working-tree diff checks, and staged diff checks passed**. The build generated all 17 pages. The checked source and test file hashes remained unchanged throughout independent QA.
- A live Gemini check created a four-step Lower Primary pathway for Photosynthesis and saved one tutor turn. Its temporary account and session were removed. The development website was restarted and returned HTTP 200.
- Independent code review found no blocking findings. The final deterministic delivery score is **10/10**: the ten defined criteria for consistent progression, duplicate detection, level depth, test coverage, integrated quality gates, independent review, and accurate reporting are satisfied.
- QA ran under Node 20.18.3 because Node 22.23.4 was not available on the machine. The project declares Node 22.23.4, so the release gates should be repeated on that declared runtime before deployment.

## Remaining limits and pilot decisions

The automated AI and speech tests use controlled mocks. The single live Gemini check verifies the provider connection and basic pathway flow, but it does not establish teaching quality across subjects. Semantically equivalent objectives written with different words can still pass duplicate detection, and the AI still supplies the completion judgment. A full downloaded speech-model inference and two-device WebRTC connection have not been tested. Restrictive networks may need a TURN relay. The last dependency audit found eight moderate advisories in the lint toolchain, with no high or critical findings at that point.

Before a student pilot, review how the tutor judges step completion using representative student answers; configure persistent backups, HTTPS, a production registration code, and a private `GEMINI_API_KEY`; and decide whether old Git history must be rewritten and affected credentials reset. Do not publish the repository as-is while historical database records remain accessible.

## Run and check

Use Node 22.23.4 or a supported Node 24. Follow `README.md`: install with `npm ci`, create a private `.env` from `.env.example`, set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `GEMINI_API_KEY`, and production `REGISTRATION_CODE`, then run `npm run db:migrate`. Start development with `npm run dev`; use `npm run build` and `npm start` for a persistent one-server deployment. Verify with `npm test`, `npm run lint`, and `npm run typecheck`.

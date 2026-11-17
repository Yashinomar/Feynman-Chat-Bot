# Live learning path and Feynman feedback

November 14, 2026 · Local checkout of `main` at `fe41547`, preserving the existing uncommitted application repair and design-demo work.

## Problem

The Figma-aligned Photosynthesis flow existed only as a predefined `/learning-path-demo`. Real study sessions saved lesson progress, but finishing the path ended the experience without an editable Feynman checkpoint, persisted five-criterion analysis, concept relationships, or a targeted lesson review. The production UI also still presented the learning path as a small collapsed disclosure instead of the main study structure.

## Changes

- Promoted the design into the real `/chat/[id]` study flow using saved topic, level, learning-path, progress, and messages.
- Added the `active → checkpoint → completed` session progression. Completing the final lesson now unlocks the checkpoint instead of ending the session immediately.
- Added a strict checkpoint endpoint with authentication, owner scoping, rate limiting, optimistic version checks, atomic report/message persistence, safe concurrent-submit handling, and idempotent request replay.
- Added a versioned persisted report containing a summary, three-node concept map, two explicit labeled relationships, all five rubric criteria, evidence, next steps, and the first lesson to review.
- Added strict AI-output validation. Invalid criteria, review indexes, concept endpoints, self-links, duplicate links, disconnected nodes, or malformed output save nothing and leave the checkpoint retryable.
- Added the production learning-path hero, lesson route, daily mission, editable checkpoint, retained drafts, feedback report, and targeted-review view using the verified dark, green, and amber visual language.
- Preserved the existing lesson conversation, notes sources, fact checks, speech input, Sidebar, deletion, and saved-draft behavior while a session is active.
- Preserved legacy completed sessions that do not have reports. Invalid reports or damaged paths fall back to the saved conversation with a clear recovery warning.
- Added request cancellation so a delayed checkpoint response cannot overwrite a different session opened while report generation is running.
- Added responsive layouts with explicit status text and icons, 44px controls, heading focus, semantic progress, stacked mobile rubric cards, larger mobile feedback copy, and no horizontal overflow.
- Added the non-destructive `checkpointReport` database migration.

## Verification

- Full automated suite: **109 tests across 14 files passed**.
- Focused checkpoint and live-UI suite: **14/14 passed**.
- ESLint passed.
- TypeScript passed.
- Production build passed and generated the dynamic checkpoint endpoint and live chat route.
- Database migration was applied successfully to a fresh local SQLite QA database.
- Browser QA passed the active path, checkpoint, report, and targeted review at desktop, 950px, 768px, 390px, and 375px widths.
- All five rubric criteria remained readable on mobile, and measured document width matched viewport width at every checked breakpoint.
- Concurrent checkpoint tests prove that only one submission commits, the losing submission saves no messages, and replay of the winning request returns the stored report without another AI call.
- Final independent code re-review scored the implementation **9.7/10** with no remaining actionable findings, above the requested 9.2 threshold.

## Limits and deployment

- Apply `prisma/migrations/202611130001_checkpoint_report/migration.sql` before deploying the application update. It adds one nullable text column and requires no backfill.
- The product currently unlocks one checkpoint after the generated learning path. Paths contain four, five, or six lessons depending on student level; enforcing a checkpoint after every five lessons across larger courses needs a persistent unit/curriculum model.
- Reports are versioned JSON stored on the session. This is appropriate for the learner experience and reload safety, but educator-wide rubric analytics would benefit from normalized report tables later.
- The feedback endpoint requires the configured Gemini service. Generation or validation failure does not advance the session and can be retried safely.
- Verification used the installed Node 25.9.0 runtime. The project declares supported Node 22 or 24; rerun the same commands on the deployment runtime.

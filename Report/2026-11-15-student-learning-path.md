# Student learning path — 2026-11-15

## Problem and changes

The Courses page displayed an administrator-dependent empty state whenever no courses had been published. It also presented course buttons and long readings rather than the winding learning path requested by the user.

Rebuilt `/courses` around the supplied Duolingo community design reference (file `1CN7L0fvMPN0p783AOdBpS`, lesson track `26:5528`). Inspected its metadata and screenshot: winding circular lesson nodes, raised controls, unit banner and current-step callout. Kept the app's dark palette and branding. Further Figma design-context requests were limited by the connected Starter plan; this is a visual adaptation, not an exact asset/font reproduction.

- Added a built-in five-lesson high-school photosynthesis course with examples and sublessons. It remains available alongside administrator-published courses and does not publish or modify administrator drafts.
- Added sequential reading nodes, current lesson, reviewable completed lessons and Feynman practice after each group of five (also after a final shorter group).
- Saved reading completion per account in `CourseReadingProgress`. Writes authenticate and check origin; duplicate saves are idempotent. Content revisions invalidate affected readings. Unpublished content is excluded.
- Removed the administrator instruction from the student experience. Signed-out students can preview the first starter lesson and receive a normal sign-in link.
- Added a prominent learning-path link on Home; renamed the navigation display label to Learn.
- Fixed missing grid opacity in the shared background and adjusted small-phone navigation spacing.

## Verification

- Full suite: 119 tests passed across 18 files before the final guest-preview test addition.
- Final targeted student-path suite: 3 tests passed, including the new guest-preview case. Covers five-lesson unlock, reload persistence, practice handoff, failed saves and guest access.
- API tests cover authentication, cross-origin rejection, account isolation, idempotency, changed lessons and unpublished content.
- Production build passed. Lint and TypeScript checks passed after the final UI adjustments. `git diff --check` reports a pre-existing extra blank line at `README.md:68`; that unrelated edit was preserved.
- Browser checked at desktop width, 390px and 320px. Verified lesson preview and sublesson content on mobile; document width does not exceed the 320px viewport.
- Screenshots: `outputs/student-path-desktop.jpg` and `outputs/student-path-mobile.jpg`.
- Local migration applied after a SQLite backup at `/private/tmp/feyman-before-reading-progress-20261115.db`.

## Limits and deployment

Reading progress is self-reported, not assessed mastery. The unlocked practice action opens the existing AI learning session, which leads to its own checkpoint and five-criterion feedback. It does not directly submit a course checkpoint or send the entire authored course as grounding; the handoff currently uses course and lesson titles. Real AI generation was not exercised in the browser during this change; navigation was verified with a controlled test response. Saved practice is accessible through Library. Course reading progress is not yet linked back to practice reports.

Run `npm run db:generate` and `npm run db:migrate` when deploying this version. Existing administrator login and authoring remain at `/admin/login` and `/admin`.

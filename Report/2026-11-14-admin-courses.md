# Administrator access and course authoring

## Request and implementation

Added password-based administrator entry at `/admin/login`, using the existing
rate-limited account authentication. A local `npm run admin:create` command creates
an administrator with hidden password entry, confirmation, bcrypt hashing, and
no overwrite or promotion of existing accounts. Public registration cannot create
administrators. Every content API request checks the current database role.

Added a persistent Course model and additive migration, draft/published snapshots,
an editor for ordered lessons and sublessons, content preview, publishing validation,
unpublishing, unsaved-edit warnings, retained input on errors, and version checks
against conflicting updates. Published content is rendered as plain text, not HTML.
The student Courses screen lists published courses and opens their lessons. Students
can start a separate existing AI practice session from a lesson topic.

## Verification

- 114 tests across 16 files passed.
- New API tests cover authentication, current admin role, cross-origin rejection,
  draft isolation, publishing, unpublishing, retry recovery, conflicting writes,
  empty-content rejection, duplicate identifiers, and unsupported fields.
- New UI tests cover retained lesson/sublesson drafts after failed saves and
  actionable publishing validation.
- Lint, TypeScript (including production build), build, script syntax, and diff
  whitespace checks passed.
- Applied the pending checkpoint migration and the new Course migration to the
  configured local database after a SQLite backup under
  `/private/tmp/feyman-before-courses.hL0kCB/dev.db`.

## Remaining limits

- User must choose credentials through `npm run admin:create`; no default/shared
  admin password was embedded or administrator account silently promoted.
- Authored content does not yet persist student reading progress or drive the AI's
  lesson-by-lesson assessment; lesson-topic practice uses the existing session flow.
- Content is plain text; media attachments and rich-text authoring are not included.
- Automated UI checks passed; this change has not had a fresh browser visual pass.
- Checks ran on installed Node 25.9.0; deploy using the project's supported runtime.

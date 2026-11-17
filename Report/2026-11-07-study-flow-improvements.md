# TeachBack study flow improvements

November 7, 2026 · Local checkout of `main` at `fe41547`, with the existing uncommitted repair work.

## Delivered

| Item | Change |
| --- | --- |
| F1 · Responsive chat | The current objective stays separate from the collapsible path. On narrow and short screens, students can collapse study tools, scroll the conversation, and reach the message box. Browser QA reproduced overflow at 721 px, so compact navigation now applies through 800 px. |
| F2 · Delete confirmation | Chat and Library use the same confirmation, name the topic, and explain that deletion removes the transcript and uploaded notes. Cancel gets initial focus. The dialog prevents duplicate requests, reports failures without removing the session, and restores focus after cancellation. Library moves focus to its heading after a successful deletion. |
| F3 · Keyboard access | Library has a real Resume link separate from Delete. The persona and Learn dialogs are named and support Escape and focus return. Persona choices use radio groups. Browser QA found that native Tab could leave Learn when its close button was the only control, so the shared dialog now wraps Tab and Shift+Tab explicitly. |
| B1 · Turn-specific fact checks | The server checks the saved answer from the current committed turn under the existing owner check. The client uses the original turn ID and commit version, including on retries. The server rejects stale checks before provider work or at the guarded save. Correction dismissal also requires the version the student saw, so an older dismissal cannot clear newer feedback. |
| B2 · Long topics | Solo and notes sessions accept topics through 200 characters. The full topic stays in the session and the app uses shorter objective wording when needed. Recognized oversized legacy paths recover on the next successful turn and keep their step order and progress. |
| B3 · Session consistency | The session update API rejects manual completion or reopening. Actual renames are limited to untouched legacy sessions with no path, notes, messages, or progress. Generated or studied sessions keep their original topic and can be studied under a different topic by starting a new session. This deliberately narrows the earlier owner rename behavior. |

## Verification

- Independent QA passed 91 tests across 11 suites. Coverage includes reordered fact checks, stale dismissals, ownership, topic boundaries for both creation routes, legacy path recovery, concurrent session updates, draft retention, delete failure and duplicate submission, and keyboard interaction.
- ESLint, standalone TypeScript, the production build, and working tree and staged whitespace checks passed on the final source and test state.
- Headless Brave checked the built app at 1280×800, 801×800, 721×800, 375×667, 320×568, 667×375, and 375×330. The transcript was scrollable and the composer reachable without horizontal overflow. The 375×330 check used expanded study tools and path controls. Real browser checks also passed for keyboard Resume, Learn and persona focus wrapping and return, persona arrow selection, delete cancellation in both views, and confirmed Library deletion against a synthetic database.
- An independent code reviewer checked the integrated implementation and the two browser follow-up fixes. No blocking findings remained.
- Delivery checklist score is **9/10**. All six approved items, the automated regression suite, build and quality checks, and independent review passed. The remaining point covers verification on the declared runtime and a physical phone.

## Verification limits

QA used Node 20.18.3. The project pins Node 22.23.4 for development. Browser QA used emulated viewports, including reduced viewport height, and synthetic study data. Physical mobile keyboard behavior remains unverified. Fact-check provider responses were controlled in tests, so the results establish turn matching and failure handling. A same-account request can deliberately recheck the latest turn within the existing quota.

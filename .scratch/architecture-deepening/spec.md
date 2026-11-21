# Deepen course navigation and question capture

Implementation: complete (2026-11-20)

## Completion

- Navigation: concentrated navigation evidence and recovery rules.
- Question capture: consolidated retention and capture accounting.
- Validation: 203 mocked regression tests passed; source-copy, syntax and release
  checks passed; benchmark operation counts were unchanged.
- Standards and Spec reviews found no actionable findings. Live course
  verification remains outstanding.

The agreed requirements below are retained as the record of this completed work.
The original implementation commits remain in the private pre-publication
archive; the public repository starts from the cleaned source snapshot.

## Agreed outcome

Implement the two candidates selected from the architecture survey as separate,
behavior-preserving changes. Navigation comes first, question capture second.
Keep the dependency-free single-file userscript and existing distribution flow.

## Course navigation

- Concentrate completion evidence, destination resolution and incomplete-lesson
  recovery rules in one module with a small caller interface.
- Keep waiting, cancellation, clicking, retries, session state and scheduling
  with Auto. Re-read navigation evidence after delays before clicking.
- Preserve full answered strips, native final-submission rules and the narrow
  partial-results navigation exception as distinct rules.
- Preserve existing acceptance of gapped partial result windows.
- Keep final assessment submission outside this module.

## Question capture

- Concentrate untouched record retention, requesting-page context, capture
  counts and refresh requests in one module used by fetch and XHR.
- Preserve each transport's current acceptance rules and response behavior.
  Fetch still adds hints; XHR leaves its response untouched.
- Preserve sequential retention and partial-failure behavior, including counts
  and refresh ordering. Fixing unexpected behavior is a separate task.

## Feedback and review

- Agreed test seams: Auto passes and observable clicks/diagnostics for
  navigation; wrapped fetch/XHR responses and resulting Auto behavior for capture.
- Replace redundant private-helper tests/access only when equivalent behavior
  coverage exists. Preserve meaningful rejection and cancellation cases.
- Add focused coverage for navigation evidence changing during a delay and
  capture failing partway through a response.
- Run syntax/source-copy checks, the full regression suite, and existing mocked
  operation-count benchmarks. Do not claim live browser compatibility.
- Review Standards and Spec separately against the initial project baseline.
- Commit the initial baseline and each refactor separately, as authorized.

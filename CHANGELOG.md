# Changelog

## [Unreleased]

### Changed

- I replaced course-derived assessment examples with synthetic fixtures and recorded upstream GPLv3 provenance for the public source snapshot.

- I concentrated course-navigation evidence and outline recovery rules in one module, preserving existing completion and delayed-action checks. Navigation regressions now use Auto behavior and diagnostics instead of private navigation helpers.
- I consolidated fetch and XMLHttpRequest question retention, request context and capture accounting, preserving their distinct filtering, response handling and partial-failure behavior.

## [3.0.5] - 2026-11-20

### Fixed

- I added final confirmation support for secure exams whose numbered question buttons omit answered accessibility labels. I require one active native Submit Page and a full, unique Q1–Qn strip before confirming.
- I check the uniquely labeled confirmation checkbox, wait for the course to enable Submit, revalidate the stage after the delay, and submit once. I cancel the action if the route changes.
- I retain the answered-label check for exams that provide those labels, and reject incomplete or duplicate strips and ambiguous confirmation controls.

### Validation and limits

- I verified all 194 browser-mocked regression checks, including the 60-question review, offscreen strip buttons, confirmation before submission, delayed Submit enabling, duplicate controls, disabled submission preference, and route changes.
- I rebuilt the release files and SHA-256 checksums. I still need to verify the final-confirmation fix in a live course.

## [3.0.4] - 2026-11-20

### Fixed

- I added SMV option-list and per-correct-option scoring support for multiple-selection questions. I require every interpretation to agree on one complete set whose size matches the required selection count.
- I capture the next question's own index from nested `nextQuestion` responses and preserve the previous answer record.
- I clear incorrect checkbox selections before selecting the required options. I reject radio controls for multiple-selection metadata.
- I added the selection count and bounded scoring interpretation text to choice diagnostics, with a clearer status for unsupported selection metadata.
- I retire locally submitted assessment questions after native numbered advancement or results, even when the old widget retains enabled inputs. I still require course completion signals for navigation.

### Validation and limits

- I verified all 188 browser-mocked regression checks, including a sanitized choose-three answer response, choose-two scoring, shuffled checkboxes, clearing an incorrect selection, native submission, conflicting option sets, count mismatches, radio controls, nested question indices, and preservation of scoring fields.
- I rebuilt the release files and SHA-256 checksums. I still need to verify the multiple-selection fix in a live course. Unfamiliar scoring formats remain unsupported.

## [3.0.3] - 2026-11-20

### Fixed

- I expanded secure-backend v3 JSON capture to find supported question records in state responses as well as individual question responses. I leave payloads without component records unchanged.
- I use native response URLs and support URL-like request inputs from other browser contexts.
- I bind indexed secure questions to their requesting page and active question number. Retained earlier questions no longer stay pending after moving forward, and earlier questions remain available for review.

### Validation and limits

- I verified all 179 browser-mocked regression checks, including repeated requests to the same endpoint, a Q1-to-Q2 Auto run, the laptop-environment question format, restored state, cross-context URL inputs, stale pending questions, review navigation, and late responses after a route change.
- I rebuilt the release files and SHA-256 checksums. I still need to verify this transition fix in a live course.

## [3.0.2] - 2026-11-20

### Fixed

- I added fetch and XMLHttpRequest capture for the secure assessment `getQuestionAt` endpoint on `ssac-backend.netacad.com`.
- I added a local selection view for single-choice questions that carry SMV scoring interpretations instead of selection flags. I require positive credit for one in-range option, zero credit for other options, and agreement across every interpretation.
- I match the selected option by text after label randomization. I preserve native selection flags when present and leave the server's scoring fields unchanged.

### Validation and limits

- I verified all 172 browser-mocked regression checks, including a sanitized fixture of the secure question format, randomized labels, submission, original scoring preservation, malformed or conflicting interpretations, multi-digit option indices, and endpoint restrictions.
- I rebuilt the release files and SHA-256 checksums. I still need to verify this fix in a live course.

## [3.0.1] - 2026-11-20

### Fixed

- I fixed open-exam detection for native Q1-style buttons without accessibility labels. These buttons retire the hidden introduction without qualifying as answered questions.
- I added passive capture of supported question schemas from existing same-origin assessment XMLHttpRequest responses and hyphenated adaptive-assessment fetch routes.
- I added a clear missing-question-data status and capture diagnostics when an open exam has no matching supported schema.

### Validation and limits

- I verified all 165 browser-mocked regression checks, including unlabeled question buttons, delayed Start cancellation, unchanged XHR responses, request reuse, malformed responses, and no additional requests.
- I still need to verify this fix in a live course. A question response with a different schema or no selection metadata still requires further support.

## [3.0.0] - 2026-11-20

### Added

- I brought continuous course Auto, lesson interactions, media recovery, diagnostics, and local release tooling together for 3.0.
- I rewrote my public documentation around installation, controls, troubleshooting, development, and release preparation.

### Fixed

- I fixed navigation from the 220-1101 certification practice results to the 220-1102 exam when their shared group is 50% complete.
- I added support for result strips that render only their final question window. I require explicit course page completion, an active result screen, and a unique following exam in the current group. Final assessment submission still requires the full answered question strip.

### Validation and limits

- I verified all 159 browser-mocked regression checks, including the Q37–Q80 results window, incomplete page state, unrelated destinations, and ambiguous controls.
- I regenerated the versioned release files and SHA-256 checksums.
- I still need to verify this navigation fix in a live course. My automated tests mock browser APIs; they do not establish compatibility with every course or browser.

## [2.9.8] - 2026-11-20

### Fixed

- I fixed navigation so completed final exam results can advance to certification practice exams inside collapsed outline groups. Navigation requires the current route's own 100% outline entry, a unique active results screen, and a fully answered numbered question strip.
- I kept Reset and Review Assessment outside forward course navigation.

### Validation and limits

- I verified all 155 browser-mocked regression checks, including a 45-question results transition and incomplete, unrelated, and ambiguous result states.
- I regenerated the release assets and checksums. I still need to verify this navigation fix in a live course.

## [2.9.7] - 2026-11-20

I bundled my course-navigation, responsiveness, and activity fixes through 2.9.7 into this release.

### Added

- I added continuous Auto sessions scoped to the course and browser tab, including module/frame reloads.
- I added Adobe Animate playback support for identifiable native Play controls and timelines.
- I added local performance recording, bounded diagnostics, and detailed matching, choice, and media reports.
- I added repository documentation, full GPLv3 license text, dependency-free release tooling, and GitHub Actions artifact preparation.

### Fixed

- I reduced repeated large DOM reads and removed text extraction that cloned course custom elements.
- I fixed navigation between modules, checkpoint exams, practice finals, and finals.
- I fixed recovery of earlier incomplete lesson content.
- I fixed matching labels that collide with connection badges, including literal “A” features.
- I fixed double decoding of literal angle-bracket and entity text in multiple-choice answers.
- I added support for duplicate multiple-choice distractors with consistent selection requirements.
- I fixed video resume attempts that stopped permanently after seeking or a failed playback call.
- I fixed quiz Start controls below the viewport and added retries when an intro remains open.
- I added bounded retries for transient control errors so they no longer disable Auto.

### Validation and limits

- I verified all 153 browser-mocked regression checks for this version.
- I added syntax and source/installable-copy consistency checks to release preparation.
- I still need to verify the latest fixes in a live course. Unsupported controls, browser playback restrictions, and course interface changes may require manual interaction.

I keep detailed engineering notes for intermediate revisions in [PERFORMANCE.txt](PERFORMANCE.txt).

# Contributing

I use Node.js 24 or newer. There are no third-party package dependencies. Here’s the workflow I follow for changes:

1. Edit `script`, the canonical userscript source.
2. Add a focused regression in `tests/script.test.cjs` for behavior changes. Browser APIs are mocked by `tests/harness.cjs`.
3. Run `npm run sync`, `npm run check`, and `npm test`.
4. Update `USAGE.txt` and `CHANGELOG.md` when behavior changes. Keep attribution and license notices intact.

When I change versions, I update `package.json`, all userscript version fields, the first line of `USAGE.txt`, `README.md`, `RELEASING.md`, and the changelog. Then I run `npm run sync`.

Keep DOM read caches scoped to synchronous reads. Revalidate controls after delays and route changes. Use native interactions and course completion markers; do not fabricate completion events or modify progress records.

## Code layout

The project remains a single userscript. Its installed name is Course Helper — Local; the repository is named NetacAuto.

- `courseNavigation` owns completion evidence, Next resolution, and incomplete-lesson recovery rules. Auto owns delays, cancellation, and clicks, and reads navigation again after waiting. Debug reports use the same navigation module. Final assessment submission keeps its separate confirmation rules.
- `questionCapture` owns untouched record retention, request context, capture counts, and refresh requests. Fetch and XMLHttpRequest keep their own request filters and response handling. Fetch supplies hint decoration and response reconstruction; capture retains each original record before decoration. Capture is sequential: a later failure can leave earlier records retained.

The script observes supported assessment JSON from existing fetch and same-origin XMLHttpRequest responses, plus supported HTTPS v3 JSON responses from `ssac-backend.netacad.com`. Indexed secure questions are associated with their requesting page and active question number. Supported SMV scoring interpretations must agree on the complete selected option set and required count. Derived selections leave stored scoring fields and XMLHttpRequest responses unchanged. Unsupported selection metadata requires manual interaction.

Tests use mocked browser behavior. Test navigation through Auto clicks and diagnostics, and capture through wrapped fetch/XHR responses and resulting Auto behavior. Prefer these caller interfaces over exposing additional private helpers. The benchmark counts mocked DOM operations and does not measure browser frame rate. Verify live course behavior separately.

All committed assessment examples must be synthetic. Follow the [fixture guidance](tests/fixtures/README.md) when turning a report into a regression; preserve the failure condition without copying course questions, answers or identifiers.

`AGENTS.md` and `docs/agents/` describe the repository's agent workflow. `GLOSSARY.md` records shared terms, and `.scratch/` holds durable local specs and tickets. Keep temporary reports, logs, diagnostic captures, and session notes outside tracked documentation.

## Reporting missing question data

The Debug report shows capture counts and visible controls, but not response bodies. A zero count means no supported schema was captured, even if a question is visible.

1. Open Firefox Developer Tools with **F12**, select **Network**, and reload the course with the helper enabled.
2. Check **Fetch/XHR** for the response containing the visible question text. If there is no match, check the full request list.
3. Include the request's URL path, response content type, and redacted response body in the bug report. Leave out request headers, cookies, tokens, launch keys, and personal information.

Use that response to reproduce the format before changing the parser. If it contains no supported question metadata, Auto requires manual interaction.

## Reporting stalls

To help me reproduce a stall, include the helper version, browser and userscript manager, steps to reproduce, status text, and a redacted Debug report. For freezes, also include the Performance report. Remove launch credentials, account/course identifiers, and personal information before sharing. State whether a result was reproduced with mocks or in a live course.

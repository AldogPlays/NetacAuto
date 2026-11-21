# Synthetic assessment fixtures

The JSON fixtures and inline assessment examples in `tests/script.test.cjs` use
invented prompts, choices, matching pairs, IDs and asset paths. They contain no
copied assessment questions or answer sets.

The examples preserve the shapes needed by the regressions: nested question
envelopes, option counts, selection indices, duplicate labels, literal badge
letters, shuffled controls, encoded text and scoring-interpretation grammar.
Native field names, control labels and selectors describe the supported formats.

When reproducing a report, replace its content with an invented example before
committing it. Preserve the failure condition and independent expected outcome;
do not commit course responses, credentials, account identifiers or answer banks.

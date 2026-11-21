# Issue tracker: Local Markdown

Issues and specs live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
  numbered from 01, with one file per ticket.
- Record triage state in a `Status:` line near the top,
  using the values in `triage-labels.md`.
- Append conversation under a `## Comments` heading.

## Publishing and fetching

When publishing, create the appropriate file and its parent directories.
When fetching a ticket, read the referenced path or numbered ticket.

## Wayfinding

- Map: `.scratch/<effort>/map.md`, containing Notes,
  Decisions-so-far, and Fog.
- Child tickets use the numbered issues directory above.
- Record `Type:` as research, prototype, grilling, or task.
- Wayfinding tickets use `Status: open`, `claimed`, or `resolved`.
- Record dependencies as `Blocked by: NN, NN`.
- A ticket is unblocked when all dependencies are resolved.
- Choose the lowest-numbered open, unblocked, unclaimed ticket.
- Save `Status: claimed` before starting work.
- To resolve, append an `## Answer`, set `Status: resolved`,
  and add a gist and ticket link to the map's Decisions-so-far.

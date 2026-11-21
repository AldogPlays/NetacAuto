# Preparing a GitHub release

I’m preparing **3.0.5**. I review and publish releases manually; my build and CI workflow only prepare the files.

## How I validate and build

1. Review `CHANGELOG.md` and the known limitations in `USAGE.txt`.
2. Confirm the userscript version, `package.json` version, and usage header agree. `npm run check` validates these and the installable copy.
3. Run `npm run release:prepare` with Node.js 24 or newer.
4. Inspect `dist/`. It contains the versioned userscript, documentation, attribution/license, `release-manifest.json`, and `SHA256SUMS`.
5. In `dist/`, run `sha256sum -c SHA256SUMS` if available.
6. Install the generated userscript for a live smoke test: panel visibility, Stop/Escape, Auto persistence, one question submission, one media/animation activity, and a module transition. Record any unverified behavior in the release notes.

## How I publish

After reviewing the files, I follow these steps:

1. Commit the reviewed source, tests, and documentation. Do not commit `dist/`, diagnostic reports, session credentials, or local environment files.
2. Create an annotated tag named exactly `v3.0.5` for this version, then push the commit and tag to [AldogPlays/NetacAuto](https://github.com/AldogPlays/NetacAuto).
3. Confirm the **Validate and prepare** GitHub Actions run passes. Tag builds reject a tag/version mismatch. The workflow can also be run manually; it only uploads an artifact for review.
4. Create a draft GitHub release for that tag. Use the corresponding changelog entry as release notes, including the live-verification limits.
5. Attach the generated versioned `.user.js`, `SHA256SUMS`, `release-manifest.json`, and the documentation/license assets listed in the manifest. The checksum list covers those individual files, not GitHub's automatically generated source archives.
6. Review the draft and publish when ready.

The public repository contains synthetic assessment fixtures and a clean source history. Automatic userscript update URLs remain disabled; updates use manual installation. Repository branding is NetacAuto, while the installed script and panel retain the Course Helper — Local name.

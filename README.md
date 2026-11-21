# NetacAuto

A browser userscript for local answer hints and optional activity assistance in supported Cisco Networking Academy courses. NetacAuto is developed independently of Cisco.

Current version: **3.0.5**. The installed script and its panel currently use the name **Course Helper — Local**.

## Install

1. Install a userscript manager such as Tampermonkey.
2. Open the [raw userscript](https://raw.githubusercontent.com/AldogPlays/NetacAuto/main/netacad-local.user.js) and confirm installation in your userscript manager.
3. Reload the course tab. Keep only one installed copy enabled.

If your userscript manager does not open the raw link, download [netacad-local.user.js](netacad-local.user.js) through GitHub, then import the file manually.

Updates are manual: replace the installed script with the newer file. Automatic update URLs are disabled.

## Use

- **Show answers** displays highlights and answer guides.
- **Fill visible** assists with supported questions currently in view.
- **Start auto** works through supported activities and follows course navigation. **Submit answers** and **Lab downloads** are separate options, both off by default.
- **Stop auto** or **Escape** cancels pending actions and clears the saved Auto session.

An explicitly started Auto session can resume across module changes and reloads in the same course and browser tab. Auto waits for course completion markers and pauses if a synchronous scan takes too long.

Supported activities include multiple choice, several matching/dropdown formats, fill blanks, sliders, lesson tabs and accordions, media playback, Adobe Animate controls, lab viewers, and supported adaptive assessment screens. Unsupported or ambiguous controls require manual interaction.

See [USAGE.txt](USAGE.txt) for settings, supported behavior, and troubleshooting.

## Verification and limitations

The current code passes 203 regression tests using mocked browser behavior, along with source-copy, syntax, and release checks. The latest changes still need a live course smoke test. Passing automated tests does not establish compatibility with every course or browser; course interface changes can require further fixes.

## Privacy and diagnostics

The script adds no telemetry, remote update checks, or independent network requests. Course interactions still trigger the platform's normal requests. Preferences are stored locally; Auto intent is stored for the browser tab.

Debug and performance reports are generated locally and are not sent automatically. **Debug reports include the current page URL, which can contain launch credentials.** Remove launch keys, personal information, and course/account identifiers before sharing them.

For a missing-question-data report, see the [capture instructions in CONTRIBUTING.md](CONTRIBUTING.md#reporting-missing-question-data).

## Development

Use Node.js **24 or newer** with npm. There are no third-party package dependencies or installation steps.

```sh
npm run check
npm test
npm run benchmark
```

Edit `script`, the canonical source, then run `npm run sync` to update its byte-identical installable copy, `netacad-local.user.js`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the code layout, testing workflow, and bug reports; [PERFORMANCE.txt](PERFORMANCE.txt) for performance investigations; and [RELEASING.md](RELEASING.md) for packaging and publishing. Changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License and attribution

**GPL-3.0-only.** See [LICENSE](LICENSE) and [NOTICE.txt](NOTICE.txt). This modified fork retains credit to byOscar (ByOscarPINE) and the [upstream GPLv3 declaration](https://greasyfork.org/en/scripts/587797-cisconetacad-cheat-show-answers/code). Assessment test content is [synthetic](tests/fixtures/README.md).

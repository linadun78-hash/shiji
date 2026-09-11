# Public Source Checklist

This repository is a local preview source release, not a hosted service or
browser-store package.

Before publishing or creating a release:

- Keep `.env`, API keys, browser exports, logs, `tmp/`, `dist/`, caches, and
  private planning files out of Git.
- Review test fixtures and screenshots for personal data and replace anything
  that is not safe to publish.
- Keep `LICENSE.md` with the source. Public visibility permits viewing and
  GitHub's platform-level fork behavior; it does not grant a general reuse or
  commercial license under this project's terms.
- Publish the extension ZIP only as a generated release artifact. The ZIP must
  contain `manifest.json`, `src/`, and `assets/`, not the Python backend,
  tests, credentials, or local data.
- Never put a real model key in `src/runtime-env.js`, `.env.example`, tests,
  screenshots, documentation, or GitHub Actions logs.

The copyright holder is `linadun78-hash`, as recorded in `LICENSE.md`.

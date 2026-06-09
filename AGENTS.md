# AGENTS.md — working agreements for AI agents in this repo

This is **funklang**, a browser reimplementation of Virgill's AmigaKlang. Read
[README.md](README.md) for what it is and [docs/architecture.md](docs/architecture.md)
for the module map before making changes.

## Golden rules

1. **Releasing = bump version + changelog.** Any time you publish a new version
   (running `./deploy.sh` or otherwise pushing the site live), you MUST first:
   - bump `version` in `package.json` per [SemVer](https://semver.org/) (patch =
     fixes, minor = backward-compatible features, major = breaking changes), and
   - add a dated `## [x.y.z] — YYYY-MM-DD` section to [CHANGELOG.md](CHANGELOG.md)
     describing the change under Added / Changed / Fixed / Removed.

   `deploy.sh` enforces this: it aborts if `package.json`'s version has no matching
   heading in `CHANGELOG.md`. Do not bypass the check.

2. **The byte-exactness is sacred.** `src/asm/akgen/` reproduces the author's
   `Aklang2Asm` output byte-for-byte, and `src/dsp/` reproduces the audio
   sample-for-sample. Both are guarded by tests (`tests/asm/akgen/`,
   `tests/dsp/bit-exact.test.ts`). Never "fix" generated output to look nicer if it
   breaks those fixtures — the goal is matching the original, warts included.

3. **Shipped code must not import `sizelab/`.** `sizelab/` is the dev-only build
   harness/oracle. `sizelab/isolation.test.ts` enforces this. Keep `src/` free of
   `sizelab/` imports.

4. **Update the in-app help on any UX change.** If you change a user-visible
   behaviour, update `src/ui/help-modal.ts` in the *same* commit.

5. **Gate before you commit a feature.** `npm run typecheck` and `npm test` must
   pass. `npm run build` must succeed (it bundles the vasm-WASM worker). The full
   `npm run gate` also runs Playwright e2e (needs a Chromium with system libs).

## Commands

| Command | What |
|---------|------|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest (unit + DSP bit-exact + byte-exact asm) |
| `npm run typecheck` | `tsc --noEmit` (strict, `exactOptionalPropertyTypes`) |
| `npm run build` | Production build (bundles vasm-WASM + size worker) |
| `./deploy.sh "msg"` | Build + publish to funklang.mkael.net (enforces rule 1) |
| `npm run asm:bin` | Oracle: patch → asm via real `Aklang2Asm` (needs `mono`) |
| `npm run export:bin` | gcc-C `.bin` build (needs wine; the original "Export Amiga Binary") |

## Conventions

- TypeScript strict; no `any` in shipped code. File references in prose use
  clickable relative paths.
- Ops are defined once in `src/schema/op-metadata.ts` — add/rename an op there, the
  picker and param widgets follow.
- Klang behaviour rules the user states go in `docs/klang-behavior.md`.

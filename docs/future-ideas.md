# Future ideas

Loose backlog of UI / DSP ideas that are deliberately deferred. Pick one
up when there's appetite; document any decisions made along the way.

## Edit envelope shape from the per-slot waveform view

**User goal.** When the edit selection is on an envelope op (enva = 7,
envd = 8, adsr = 23), the small waveform tap on that slot row currently
shows the post-envelope signal (i.e. whatever the env multiplied with).
Make it ALSO show the envelope shape itself and let the user reshape it
by dragging control points instead of nudging individual knobs.

**How it would work.**

1. **Detection.** In `slot-grid.ts` / `wave-viewer.ts`, when the rendered
   op is an envelope op, derive the envelope's shape directly from the
   slot fields rather than (or layered on top of) the audio tap.
   - enva: linear ramp from 0 → `gainVal` over `val1Value` samples, then
     hold (until the next env event).
   - envd: ramp from `gainVal` → `val2Value` over `val1Value` samples.
   - adsr: 4-segment piecewise — attack (`val2Value` samples, 0 →
     `gainVal`), decay (`val1Value` samples, → sustain level `widthVal`),
     sustain (hold), release (`freqVal` samples, → 0).
2. **Rendering.** Overlay a brighter polyline on the existing waveform
   canvas (separate stroke colour, e.g. cyan), with small square handles
   at every inflection point.
3. **Dragging.** Each handle is one slot field:
   - X-axis drag → time-domain field (`val1Value`, `val2Value`, `freqVal`).
   - Y-axis drag → level field (`gainVal`, `widthVal`).
   Mapping pixels → field range uses the same per-op min/max already
   declared in `op-metadata.ts`.
4. **Write path.** On `pointermove` while dragging, throttle to ~16 ms
   and call `model.setSlotParam` per affected field. History coalescing
   (600 ms window per (instrIdx, slotIdx, field)) already collapses the
   whole drag into one undo entry — no new history work needed.
5. **Discoverability.** Handles only visible when the slot is the
   edit selection (`.slot.selected`); otherwise the overlay is a quiet
   tint so the row still reads as "this is an envelope".

**Why deferred.** Needs (a) per-op shape sampler, (b) hit-testing on a
small canvas, (c) min/max ranges per axis, (d) careful interaction with
the existing wave canvas which is currently a pure read-only display.
The knob row already exposes every field, so this is purely an
ergonomics improvement.

## Progressive Web App (offline / installable)

**User goal.** "How to wrap this to a progressive webapp which does not
require internet after it has been installed once to the system."

Funklang is already a static SPA with no backend, no analytics, no API
calls — turning it into an installable, fully-offline PWA is mostly
plumbing.

**How it would work.**

1. **vite-plugin-pwa.** Add as a dev dep. About five lines in
   `vite.config.ts`:
   ```ts
   import { VitePWA } from 'vite-plugin-pwa';
   export default defineConfig({
     plugins: [
       VitePWA({
         registerType: 'autoUpdate',
         workbox: { globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico}'] },
         manifest: {
           name: 'funklang',
           short_name: 'funklang',
           description: 'A web-based editor for AmigaKlang patches.',
           theme_color: '#ffb14e',
           background_color: '#0a0a0c',
           display: 'standalone',
           icons: [
             { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
             { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
             { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
           ],
         },
       }),
     ],
   });
   ```
2. **Self-host fonts.** Today the app pulls Silkscreen + IBM Plex Mono
   from Google Fonts at runtime. Replace with `@fontsource/silkscreen`
   and `@fontsource/ibm-plex-mono` so the .woff2 files are bundled and
   precached by Workbox. Drop the `<link rel="preconnect">` /
   `<link href="https://fonts...">` lines from `index.html` and add the
   imports to `src/main.ts`:
   ```ts
   import '@fontsource/silkscreen/400.css';
   import '@fontsource/silkscreen/700.css';
   import '@fontsource/ibm-plex-mono/400.css';
   import '@fontsource/ibm-plex-mono/500.css';
   import '@fontsource/ibm-plex-mono/600.css';
   ```
3. **Icons.** Need PNG icons at 192px, 512px, and a 512px "maskable"
   variant (safe-area padded). One SVG source rendered at three sizes is
   fine — `sharp` CLI or a one-shot rasteriser. Aesthetic: amber dot on
   `#0a0a0c` matching the brand.
4. **Hosting.** Service workers require HTTPS (or `http://localhost`).
   `npm run preview` is fine for local testing. For real distribution:
   any static host — GitHub Pages, Cloudflare Pages, plain Apache —
   works. `file://` will NOT activate the SW; that's a browser security
   rule, not something we can work around.
5. **Verification.**
   - Build + preview, install via Chrome's address-bar install icon.
   - DevTools → Application → Service Workers shows funklang active.
   - DevTools → Network → Offline checkbox → app still loads + opens
     local `.akp` files + saves them.
6. **What still needs network.** Nothing in the editor — the DSP /
   audio / file I/O are all browser-native. The only outbound calls
   today are the Google Fonts CSS/woff2 fetch on first paint; step 2
   eliminates them.

**Why deferred.** Pure ergonomic / distribution polish, not a
functional gap. The app already works fully offline once a normal page
load has completed (everything is JS + CSS + a single Web Audio API).
The PWA wrapper just makes the install-and-forget-the-net story formal
and adds an OS-level launch icon.

**Risk.** Almost none. The plugin is widely-used (Vite's official
companion). Self-hosting fonts is a one-line CSS swap. Total work:
~30 minutes including icon rasterisation.

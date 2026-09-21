# Knightbook logo

The user approved `knightbook-logo.png` on 2026-09-20. It is the canonical logo:
a white chess knight on a navy book cover, with an uninterrupted white page block
at the bottom. Do not restore the horizontal line inside the pages.

The PNG is the exact approved image, copied without modification from the built-in
image-generation output. It is the only approved source artwork: the SVG attempts
were rejected and removed, and nothing here should be traced, redrawn, or
regenerated from them.

`apps/desktop/build/icon.png` is derived from this file — a 1024×1024 resize, made
with Electron's own `nativeImage`, which is what electron-builder turns into the
Windows `.ico` and macOS `.icns` at package time. Regenerate it from this PNG
rather than editing it directly, so there is one source image and not two that can
drift apart.

At 32 pixels and larger the knight stays legible. At 16 pixels — a small Windows
taskbar, a favicon — the mark reduces to a navy tile with a pale shape in it,
which is inherent to artwork with this much detail rather than something the
resize introduced.

Generation brief: a classic Staunton chess knight on a minimal closed book cover,
navy and white, no text. Final edit prompt: remove only the dark horizontal line
inside the white page block, preserving the knight, pedestal, spine, and cover.

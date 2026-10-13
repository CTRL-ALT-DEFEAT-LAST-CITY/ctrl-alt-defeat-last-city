# Artwork

## What the game loads

The game loads the **`.webp`** files in `zones/` and `pets/`. They are the
project's original artwork, re-encoded for the web.

| Set | Original PNG | Shipped WebP | Change |
|---|---|---|---|
| `zones/*` | 1536×1024, ~2.3 MB each | 1536×1024, ~120–230 KB each | same size, ~94% smaller |
| `pets/*`  | 1536×1024, ~2.4 MB each | 768×512, ~130–150 KB each  | half the dimensions, ~94% smaller |

Together that takes the artwork the browser downloads from about **23 MB to
1.5 MB**, which is the difference between a slow and a fast first load on a
phone.

The re-encode was verified rather than assumed: in the visible (opaque) pixels
each WebP differs from its PNG by roughly 5 parts in 255, and the alpha channel
is bit-identical.

### Why the companion atlases could be halved

Each pet atlas is a 3×2 grid. The largest the game ever draws one cell is
128 px (`.pet-art` in `src/styles/cyberpunk.css`). At 768×512 a cell is 256 px,
so there is still 2× headroom for high-DPI screens with no visible difference.

The stylesheet positions cells with `background-size: 300% 200%` — percentages,
not pixels — so the new dimensions needed no CSS change.

### Why there is no PNG or JPEG fallback

The game already calls `dialog.showModal()`, which needs Safari 15.4+ (2022),
Chrome 37+ and Firefox 98+. WebP has been supported since Safari 14 (2020),
Chrome 32 and Firefox 65 — strictly *earlier* than the `<dialog>` support the
game already depends on. Any browser that can run Last City can display WebP,
so a fallback copy would be several megabytes nobody ever downloads.

## Where the PNG originals are

The `.png` originals are **not** included in the update ZIP, because the game
no longer loads them and they are already in the repository. They are still
useful as editable source art — leave them where they are. Nothing references
them at runtime, so they cost nothing to keep and nothing to delete.

## Re-exporting

If you edit a PNG, regenerate its WebP with the same settings:

```bash
# zone background (no transparency, keep dimensions)
python3 -c "from PIL import Image; Image.open('assets/zones/ashfall.png').convert('RGB').save('assets/zones/ashfall.webp','WEBP',quality=80,method=6)"

# companion atlas (keeps transparency, halved dimensions)
python3 -c "from PIL import Image; im=Image.open('assets/pets/ember.png').convert('RGBA').resize((768,512),Image.LANCZOS); im.save('assets/pets/ember.webp','WEBP',quality=85,method=6)"
```

## Everything else is drawn in code

The city, the battle arena, the opening cinematic, every building, unit,
citizen, particle and weather effect is generated procedurally on a canvas.
There are no sprite sheets, so there is nothing to go missing, and the art stays
sharp at every zoom level and pixel density. All music and sound effects are
synthesised with the Web Audio API; no audio files are downloaded.

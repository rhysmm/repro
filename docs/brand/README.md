# Repro icon

Generated with the built-in imagegen tool. The source is `icon-source.png`; Chrome uses the 16, 32, 48, and 128-pixel PNGs in `extension/icons/`.

Prompt:

> Use case: logo-brand. Create one production Chrome extension icon for an app named Repro, which records browser bug reproductions. A bold simple clockwise replay arrow surrounding a solid circular recording dot, both warm coral-red, centered on a dark ink navy rounded-square tile. Flat crisp geometric graphic, no lettering, no wordmark, no shadows, no gradients, no texture, no thin strokes, no extra details. The replay arrow should be a thick almost circular arc with a clear chunky arrowhead at upper right and a generous gap. The center dot should remain distinct from the arc. It must remain recognizable at 16 by 16 pixels. Single centered icon, square canvas, tile occupies about 90 percent of canvas, transparent outside the rounded tile. Not a presentation or mockup, just the icon asset.

To regenerate the PNG sizes from the source, run from the repository root:

```sh
node --input-type=module <<'JS'
import sharp from 'sharp';
for (const size of [16, 32, 48, 128]) {
  await sharp('docs/brand/icon-source.png').resize(size, size).png().toFile(`extension/icons/icon-${size}.png`);
}
JS
```

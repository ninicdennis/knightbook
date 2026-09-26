/*
 * Derives build/icon.png from the approved logo (D-021), and from it the small
 * mark the title bar shows (src/renderer/app/knightbook-mark.png). Run with Electron, not
 * Node, because it uses Electron's own image resampler:
 *
 *   pnpm --filter @knightbook/desktop derive:icon
 *
 * The logo has wide transparent margins, so a plain resize leaves the artwork
 * filling about half the native icon slot. This crops to the artwork's alpha
 * bounds and fits the whole of it, proportions unchanged, into the square with
 * a small margin. Pixels below ALPHA_THRESHOLD are generator haze at most ~1%
 * opaque, spread far outside the artwork; they are what is trimmed, not art.
 *
 * It prints the measurements, so a regeneration can be compared with the last.
 */
process.on('uncaughtException', (error) => {
  console.error(`derive-icon failed: ${error.message}`)
  process.exit(1)
})

const { app, nativeImage } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SOURCE = join(__dirname, '..', '..', '..', 'docs', 'assets', 'knightbook-logo.png')
const OUTPUT = join(__dirname, '..', 'build', 'icon.png')
const SIZE = 1024
/**
 * Shown at 20 CSS pixels in the title bar. 96 covers display scaling up to
 * 400% without shipping the megabyte-sized icon to the renderer.
 */
const MARK_OUTPUT = join(__dirname, '..', 'src', 'renderer', 'app', 'knightbook-mark.png')
const MARK_SIZE = 96
/** Margin on each side of the longer dimension, so the edge is not clipped by an OS mask. */
const MARGIN = 20
const ALPHA_THRESHOLD = 4

function alphaBounds(image) {
  const { width, height } = image.getSize()
  const pixels = image.toBitmap()
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < ALPHA_THRESHOLD) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < 0) throw new Error('The source image has no visible pixels.')
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Copies a BGRA/RGBA bitmap into the centre of a transparent square of the same format. */
function centreOnSquare(image) {
  const { width, height } = image.getSize()
  const pixels = image.toBitmap()
  const square = Buffer.alloc(SIZE * SIZE * 4)
  const left = Math.floor((SIZE - width) / 2)
  const top = Math.floor((SIZE - height) / 2)
  for (let row = 0; row < height; row++) {
    pixels.copy(square, ((top + row) * SIZE + left) * 4, row * width * 4, (row + 1) * width * 4)
  }
  return nativeImage.createFromBitmap(square, { width: SIZE, height: SIZE })
}

void app.whenReady().then(() => {
  const source = nativeImage.createFromPath(SOURCE)
  if (source.isEmpty()) throw new Error(`Could not read ${SOURCE}`)

  const art = alphaBounds(source)
  const scale = (SIZE - 2 * MARGIN) / Math.max(art.width, art.height)
  const fitted = source.crop(art).resize({
    width: Math.round(art.width * scale),
    height: Math.round(art.height * scale),
    quality: 'best',
  })
  const icon = centreOnSquare(fitted)
  writeFileSync(OUTPUT, icon.toPNG())
  writeFileSync(
    MARK_OUTPUT,
    icon.resize({ width: MARK_SIZE, height: MARK_SIZE, quality: 'best' }).toPNG(),
  )

  const result = alphaBounds(icon)
  const sourceSize = source.getSize()
  console.log(
    JSON.stringify(
      {
        source: `${sourceSize.width}x${sourceSize.height}, artwork ${art.width}x${art.height} at ${art.x},${art.y}`,
        mark: `${MARK_SIZE}x${MARK_SIZE}`,
        output: `${SIZE}x${SIZE}, artwork ${result.width}x${result.height} at ${result.x},${result.y}`,
        occupancy: `${((result.width / SIZE) * 100).toFixed(1)}% wide, ${((result.height / SIZE) * 100).toFixed(1)}% tall`,
      },
      null,
      2,
    ),
  )
  app.quit()
})

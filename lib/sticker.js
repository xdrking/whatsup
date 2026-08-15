import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import webp from 'node-webpmux'
import logger from './logger.js'

const execFileAsync = promisify(execFile)
const TEMP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'temp')

const SIZE = 512
const MAX_DURATION_SEC = 6
// WhatsApp animasyonlu sticker'da ~1MB üstünü reddediyor; pay bırakıldı.
const MAX_ANIMATED_BYTES = 800 * 1024

// Kalite basamakları: çıktı sınırı aşarsa sıradaki basamakla yeniden denenir.
const QUALITY_STEPS = [
  { fps: 15, quality: 60 },
  { fps: 12, quality: 40 },
  { fps: 10, quality: 20 },
]

/**
 * WhatsApp sticker paketi bilgisini WebP'nin EXIF alanına yazar. Bu olmadan
 * sticker gönderilir ama paket/yayıncı bilgisi boş görünür.
 *
 * Baştaki bayt dizisi sabit bir TIFF/EXIF başlığıdır; 14. bayttan itibaren
 * gelen 32-bit değer JSON'un uzunluğudur ve her seferinde yeniden yazılır.
 */
async function writeStickerMetadata(webpBuffer, { pack, author }) {
  const payload = {
    'sticker-pack-id': `wp-bot-${Buffer.from(pack).toString('hex').slice(0, 16)}`,
    'sticker-pack-name': pack,
    'sticker-pack-publisher': author,
    emojis: ['🤖'],
  }

  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ])
  const exif = Buffer.concat([header, json])
  exif.writeUInt32LE(json.length, 14)

  const image = new webp.Image()
  await image.load(webpBuffer)
  image.exif = exif
  return image.save(null)
}

/** Görseli 512x512 saydam zeminli statik sticker'a çevirir. */
export async function imageToSticker(buffer, meta) {
  const webpBuffer = await sharp(buffer)
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 85 })
    .toBuffer()

  return writeStickerMetadata(webpBuffer, meta)
}

/** Statik sticker'ı PNG'ye geri çevirir. */
export async function stickerToImage(buffer) {
  return sharp(buffer).png().toBuffer()
}

/**
 * Animasyonlu sticker'ı mp4'e çevirir (WhatsApp animasyonlu görseli video
 * olarak ister).
 *
 * ffmpeg animasyonlu WebP'yi ÇÖZEMİYOR ("image data not found"), bu yüzden
 * araya sharp ile GIF köprüsü konur. mp4 muxer'ı da geri sarılabilir çıktı
 * istediği için stdout yerine geçici dosya kullanılır.
 */
export async function stickerToVideo(buffer) {
  await mkdir(TEMP_DIR, { recursive: true })

  const id = randomUUID()
  const gifPath = path.join(TEMP_DIR, `${id}.gif`)
  const mp4Path = path.join(TEMP_DIR, `${id}.mp4`)

  try {
    await writeFile(gifPath, await sharp(buffer, { animated: true }).gif().toBuffer())

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', gifPath,
      '-movflags', 'faststart',
      '-pix_fmt', 'yuv420p',
      // H.264 çift sayıda genişlik/yükseklik ister.
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      mp4Path,
    ])

    return readFile(mp4Path)
  } finally {
    for (const file of [gifPath, mp4Path]) {
      await rm(file, { force: true }).catch((err) =>
        logger.error({ err, file }, 'Geçici dosya silinemedi'),
      )
    }
  }
}

/**
 * Video/GIF'i animasyonlu WebP sticker'a çevirir. İlk 6 saniye alınır;
 * çıktı boyut sınırını aşarsa kalite düşürülerek yeniden denenir.
 */
export async function videoToSticker(buffer, meta) {
  await mkdir(TEMP_DIR, { recursive: true })

  const id = randomUUID()
  const inputPath = path.join(TEMP_DIR, `${id}.input`)
  const outputPath = path.join(TEMP_DIR, `${id}.webp`)

  try {
    await writeFile(inputPath, buffer)

    let smallest = null

    for (const step of QUALITY_STEPS) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-t', String(MAX_DURATION_SEC),
        '-vf',
        `fps=${step.fps},scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,` +
          `format=rgba,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=#00000000`,
        '-loop', '0',
        '-an',
        '-c:v', 'libwebp_anim',
        '-quality', String(step.quality),
        '-compression_level', '6',
        outputPath,
      ])

      const result = await readFile(outputPath)
      if (result.length <= MAX_ANIMATED_BYTES) {
        return writeStickerMetadata(result, meta)
      }

      smallest = result
      logger.warn(
        { bytes: result.length, ...step },
        'Sticker boyut sınırını aştı, kalite düşürülüp yeniden denenecek',
      )
    }

    // Son basamak da sınırı aştı: WhatsApp büyük ihtimalle reddeder, bu yüzden
    // sessizce göndermek yerine çağıran tarafa hata verilir.
    throw new Error(
      `Sticker en düşük kalitede bile çok büyük (${Math.round(smallest.length / 1024)} KB)`,
    )
  } finally {
    await rm(inputPath, { force: true }).catch((err) =>
      logger.error({ err, inputPath }, 'Geçici girdi dosyası silinemedi'),
    )
    await rm(outputPath, { force: true }).catch((err) =>
      logger.error({ err, outputPath }, 'Geçici çıktı dosyası silinemedi'),
    )
  }
}

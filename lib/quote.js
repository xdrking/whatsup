import sharp from 'sharp'
import logger from './logger.js'

// Kart 512 genişlikte üretilir; imageToSticker onu 512x512 saydam tuvale
// ortalar. Yükseklik metne göre değişir.
const CARD_WIDTH = 512
const PADDING = 20
const AVATAR = 88
const GAP = 14
const BUBBLE_PADDING = 18
const RADIUS = 18

const BUBBLE_X = PADDING + AVATAR + GAP
const BUBBLE_WIDTH = CARD_WIDTH - BUBBLE_X - PADDING
const TEXT_WIDTH = BUBBLE_WIDTH - BUBBLE_PADDING * 2
const TEXT_X = BUBBLE_X + BUBBLE_PADDING

const FONT = 'DejaVu Sans'
const BUBBLE_FILL = '#1f2c34'
// Koyu temada sticker arka planla kaynaşmasın diye ince bir kenar çizilir.
const BUBBLE_STROKE = '#3b4a54'
const TEXT_COLOR = '#e9edef'

// Uzun metin küçük punto demek; punto belli bir noktadan sonra okunmaz.
const MAX_CHARS = 400

// WhatsApp'ın grup içi ad renklerine yakın palet.
const NAME_COLORS = [
  '#53bdeb', '#e542a3', '#00a884', '#ff8a65',
  '#7f66ff', '#f6c344', '#ff5c8d', '#26c4dc',
]

function colorFor(seed) {
  let hash = 0
  for (const char of String(seed || '')) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0
  }
  return NAME_COLORS[hash % NAME_COLORS.length]
}

// Pango ve SVG aynı karakterleri özel sayar; kaçırılmazsa tek bir "&" belgeyi
// bozar ve render hiç gerçekleşmez.
function escapeMarkup(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function fontSizeFor(length) {
  if (length <= 60) return 24
  if (length <= 140) return 20
  if (length <= 260) return 17
  return 15
}

/** Pango ile metni çizer, çizilen görüntüyü ve yüksekliğini döner. */
async function renderText(markup, width) {
  const buffer = await sharp({
    text: { text: markup, rgba: true, width, wrap: 'word', font: FONT, align: 'left' },
  })
    .png()
    .toBuffer()

  const { height } = await sharp(buffer).metadata()
  return { buffer, height }
}

/** Profil fotoğrafını daire biçiminde kırpar. */
async function circleAvatar(buffer) {
  const mask = Buffer.from(
    `<svg width="${AVATAR}" height="${AVATAR}">` +
      `<circle cx="${AVATAR / 2}" cy="${AVATAR / 2}" r="${AVATAR / 2}" fill="#fff"/></svg>`,
  )

  return sharp(buffer)
    .resize(AVATAR, AVATAR, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

/** Profil fotoğrafı yoksa (gizlilik ayarı ya da hiç yoksa) baş harfli daire. */
async function letterAvatar(name, seed) {
  // Türkçe'de "i" harfinin büyüğü "İ"; varsayılan toUpperCase "I" verir.
  const letter = escapeMarkup((name.trim()[0] || '?').toLocaleUpperCase('tr'))
  const half = AVATAR / 2

  const svg =
    `<svg width="${AVATAR}" height="${AVATAR}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${half}" cy="${half}" r="${half}" fill="${colorFor(seed)}"/>` +
    `<text x="${half}" y="${half}" dy="0.35em" text-anchor="middle" ` +
    `font-family="${FONT}" font-size="42" font-weight="bold" fill="#ffffff">${letter}</text>` +
    '</svg>'

  return sharp(Buffer.from(svg)).png().toBuffer()
}

function bubbleSvg(cardHeight, bubbleHeight) {
  const top = PADDING
  // Balonun sol üstündeki küçük kuyruk, WhatsApp'taki gelen mesaj balonu gibi.
  const tail =
    `M ${BUBBLE_X} ${top + 6} L ${BUBBLE_X - 11} ${top + 2} ` +
    `L ${BUBBLE_X} ${top + 28} Z`

  return Buffer.from(
    `<svg width="${CARD_WIDTH}" height="${cardHeight}" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="${tail}" fill="${BUBBLE_FILL}" stroke="${BUBBLE_STROKE}" stroke-width="1.5"/>` +
      `<rect x="${BUBBLE_X}" y="${top}" width="${BUBBLE_WIDTH}" height="${bubbleHeight}" ` +
      `rx="${RADIUS}" ry="${RADIUS}" fill="${BUBBLE_FILL}" ` +
      `stroke="${BUBBLE_STROKE}" stroke-width="1.5"/>` +
      '</svg>',
  )
}

/**
 * Yanıtlanan metin mesajını, yazarının adı ve profil fotoğrafıyla birlikte
 * bir sohbet balonu görüntüsüne çevirir.
 *
 * @param {object}  input
 * @param {string}  input.name   Yazarın WhatsApp adı
 * @param {string}  input.text   Mesaj metni
 * @param {Buffer?} input.avatar Profil fotoğrafı; yoksa baş harf üretilir
 * @param {string}  input.jid    Renk tohumu (aynı kişi hep aynı renk alsın diye)
 * @returns {Promise<Buffer>} PNG
 */
export async function renderQuoteCard({ name, text, avatar = null, jid = '' }) {
  const clean = String(text).replace(/\s+$/g, '')
  const body = clean.length > MAX_CHARS ? `${clean.slice(0, MAX_CHARS)}…` : clean
  const displayName = String(name || '').trim() || 'Bilinmeyen'
  const accent = colorFor(jid || displayName)

  const [nameLayer, textLayer] = await Promise.all([
    renderText(
      `<span foreground="${accent}" size="17pt" weight="bold">${escapeMarkup(displayName)}</span>`,
      TEXT_WIDTH,
    ),
    renderText(
      `<span foreground="${TEXT_COLOR}" size="${fontSizeFor(body.length)}pt">` +
        `${escapeMarkup(body)}</span>`,
      TEXT_WIDTH,
    ),
  ])

  const bubbleHeight = BUBBLE_PADDING * 2 + nameLayer.height + 6 + textLayer.height
  const cardHeight = PADDING * 2 + Math.max(AVATAR, bubbleHeight)

  let avatarLayer
  if (avatar) {
    try {
      avatarLayer = await circleAvatar(avatar)
    } catch (err) {
      // Bozuk/desteklenmeyen profil fotoğrafı yüzünden komut düşmesin.
      logger.warn({ err }, 'Profil fotoğrafı işlenemedi, baş harf kullanılacak')
      avatarLayer = await letterAvatar(displayName, jid || displayName)
    }
  } else {
    avatarLayer = await letterAvatar(displayName, jid || displayName)
  }

  return sharp({
    create: {
      width: CARD_WIDTH,
      height: cardHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: bubbleSvg(cardHeight, bubbleHeight), top: 0, left: 0 },
      { input: avatarLayer, top: PADDING, left: PADDING },
      { input: nameLayer.buffer, top: PADDING + BUBBLE_PADDING, left: TEXT_X },
      {
        input: textLayer.buffer,
        top: PADDING + BUBBLE_PADDING + nameLayer.height + 6,
        left: TEXT_X,
      },
    ])
    .png()
    .toBuffer()
}

// .wrapped görseli. Metin pango ile çizilir (Türkçe harf ve renkli emoji için, quote.js gibi),
// zemin ve kutular SVG'dir. Kutu yüksekliği içindeki metne göre hesaplanır, kart buna göre uzar.
import sharp from 'sharp'
import { circleAvatar, escapeMarkup, letterAvatar } from './quote.js'

const W = 1080
const PAD = 64
const GAP = 24
const KUTU_PAD = 28
const AVATAR = 168
const FONT = 'DejaVu Sans'

const RENK = {
  zemin1: '#160a2e',
  zemin2: '#4a1158',
  zemin3: '#0b2140',
  vurgu: '#ff5fa2',
  yesil: '#1ed760',
  soluk: '#cdbbf2',
  silik: '#9c8cc0',
}

async function metin(markup, width, align = 'left') {
  const buffer = await sharp({
    text: { text: markup, rgba: true, width, wrap: 'word', font: FONT, align, dpi: 72 },
  }).png().toBuffer()
  const { height } = await sharp(buffer).metadata()
  return { buffer, height }
}

const span = (pt, renk, icerik, kalin = false) =>
  `<span size="${pt}pt" foreground="${renk}"${kalin ? ' weight="bold"' : ''}>${escapeMarkup(icerik)}</span>`

function zemin(yukseklik, kutular) {
  const rects = kutular
    .map((k) =>
      `<rect x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" rx="28" fill="#ffffff" fill-opacity="0.08" ` +
      'stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>')
    .join('')
  return Buffer.from(
    `<svg width="${W}" height="${yukseklik}" xmlns="http://www.w3.org/2000/svg">` +
      '<defs><linearGradient id="z" x1="0" y1="0" x2="1" y2="1">' +
      `<stop offset="0" stop-color="${RENK.zemin1}"/><stop offset="0.55" stop-color="${RENK.zemin2}"/>` +
      `<stop offset="1" stop-color="${RENK.zemin3}"/></linearGradient></defs>` +
      `<rect width="${W}" height="${yukseklik}" fill="url(#z)"/>` +
      `<circle cx="${W - 120}" cy="160" r="260" fill="${RENK.vurgu}" fill-opacity="0.18"/>` +
      `<circle cx="80" cy="${yukseklik - 140}" r="300" fill="${RENK.yesil}" fill-opacity="0.10"/>` +
      rects +
      '</svg>',
  )
}

/**
 * @param {object} k
 * @param {string} k.ust          küçük üst yazı ("WRAPPED")
 * @param {string} k.baslik       kişi ya da grup adı
 * @param {string} k.altBaslik    tarih aralığı
 * @param {Buffer?} k.avatar      profil fotoğrafı; yoksa baş harf
 * @param {string} k.seed         baş harf dairesinin renk tohumu
 * @param {{deger: string, etiket: string}} k.hero  büyük sayı
 * @param {{ad: string, aciklama: string}?} k.rozet
 * @param {{ikon: string, etiket: string, deger: string, alt?: string}[]} k.kutular
 * @param {string} k.alt          dip yazı
 * @returns {Promise<Buffer>} JPEG
 */
export async function wrappedKarti(k) {
  const ic = W - PAD * 2
  const parcalar = []
  let y = PAD

  const foto = k.avatar ? await circleAvatar(k.avatar, AVATAR).catch(() => null) : null
  parcalar.push({ input: foto ?? (await letterAvatar(k.baslik, k.seed, AVATAR)), left: PAD, top: y })

  const basX = PAD + AVATAR + 32
  const bas = await metin(
    `${span(18, RENK.yesil, k.ust, true)}\n${span(44, '#ffffff', k.baslik, true)}\n${span(17, RENK.soluk, k.altBaslik)}`,
    W - basX - PAD,
  )
  parcalar.push({ input: bas.buffer, left: basX, top: y + Math.max(0, (AVATAR - bas.height) / 2) })
  y += Math.max(AVATAR, bas.height) + 48

  const hero = await metin(`${span(96, '#ffffff', k.hero.deger, true)}\n${span(24, RENK.soluk, k.hero.etiket)}`, ic)
  parcalar.push({ input: hero.buffer, left: PAD, top: y })
  y += hero.height + 36

  const kutular = []
  if (k.rozet) {
    const r = await metin(
      `${span(15, RENK.silik, 'TARZIN')}\n${span(36, RENK.vurgu, k.rozet.ad, true)}\n${span(18, RENK.soluk, k.rozet.aciklama)}`,
      ic - KUTU_PAD * 2,
    )
    kutular.push({ x: PAD, y, w: ic, h: r.height + KUTU_PAD * 2 })
    parcalar.push({ input: r.buffer, left: PAD + KUTU_PAD, top: y + KUTU_PAD })
    y += r.height + KUTU_PAD * 2 + GAP
  }

  const kw = Math.floor((ic - GAP) / 2)
  const cizilen = await Promise.all(
    k.kutular.map((b) =>
      metin(
        `${span(16, RENK.soluk, `${b.ikon} ${b.etiket}`)}\n${span(30, '#ffffff', b.deger, true)}` +
          (b.alt ? `\n${span(15, RENK.silik, b.alt)}` : ''),
        kw - KUTU_PAD * 2,
      ),
    ),
  )
  for (let i = 0; i < cizilen.length; i += 2) {
    const satir = cizilen.slice(i, i + 2)
    const h = Math.max(...satir.map((c) => c.height)) + KUTU_PAD * 2
    satir.forEach((c, j) => {
      const x = PAD + j * (kw + GAP)
      kutular.push({ x, y, w: kw, h })
      parcalar.push({ input: c.buffer, left: x + KUTU_PAD, top: y + KUTU_PAD })
    })
    y += h + GAP
  }

  const dip = await metin(span(16, RENK.silik, k.alt), ic, 'centre')
  parcalar.push({ input: dip.buffer, left: PAD, top: y + 12 })
  const yukseklik = Math.round(y + 12 + dip.height + PAD)

  return sharp(zemin(yukseklik, kutular))
    .composite(parcalar.map((p) => ({ ...p, left: Math.round(p.left), top: Math.round(p.top) })))
    .jpeg({ quality: 90 })
    .toBuffer()
}

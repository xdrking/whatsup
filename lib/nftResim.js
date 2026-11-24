// NFT görselleri: `no`'dan türeyen simetrik piksel mahluk. Rastgelelik fnv1a tohumludur,
// aynı no her zaman aynı görseli verir, dosya saklanmaz.
import sharp from 'sharp'
import { fnv1a } from './hash.js'
import { NADIRLIK, NFTLER } from './nft.js'

const IZGARA = 14
const ZEMIN = {
  mitik: ['#ff8fd0', '#3a1460'],
  sirket: ['#29c7ff', '#0a2547'],
  efsane: ['#ffb800', '#7a2d00'],
  nadir: ['#8b3dff', '#1c0b45'],
  siradan: ['#4d6b8a', '#1a2736'],
}
const GOVDE = ['#37e2a0', '#ff6b81', '#ffd166', '#5bc0ff', '#f58bff', '#b8f35a', '#ff9f43', '#e6e9f0']

function uretec(tohum) {
  let i = 0
  return (n) => fnv1a(`${tohum}|${i++}`) % n
}

/** Gövde pikselleri (anahtar → gölgeli mi): yarısı çekilir, aynalanır; kenara doğru seyrelir. */
function govde(rnd) {
  const dolu = new Map()
  const orta = IZGARA / 2
  for (let y = 3; y < IZGARA - 1; y++) {
    for (let x = 0; x < orta; x++) {
      const uzak = Math.abs(y - 7) + (orta - 1 - x) * 1.1
      const sans = 140 - uzak * 16
      if (rnd(100) < sans) {
        const golgeli = !rnd(6)
        dolu.set(`${x},${y}`, golgeli)
        dolu.set(`${IZGARA - 1 - x},${y}`, golgeli)
      }
    }
  }
  return dolu
}

function baslik(sinif, rnd, p) {
  if (sinif === 'sirket') return ['5,2', '6,2', '7,2', '8,2', '4,3', '5,3', '6,3', '7,3', '8,3', '9,3'].map((k) => p(k, '#111827')).join('')
  if (sinif === 'efsane') {
    return ['4,2', '5,3', '6,2', '7,2', '8,3', '9,2', '4,3', '6,3', '7,3', '9,3', '4,1', '9,1'].map((k) => p(k, '#fff2a8')).join('')
  }
  if (sinif === 'nadir') return ['3,3', '4,3', '5,3', '6,3', '7,3', '8,3', '9,3', '10,3', '5,2', '6,2', '7,2', '8,2'].map((k) => p(k, '#16121f')).join('')
  return rnd(2) ? ['4,2', '9,2', '3,1', '10,1'].map((k) => p(k, '#ffffff')).join('') : ''
}

const SAC = '#8a5532'
const SAC_KOYU = '#6b3f22'
const TEN = '#f9d9c2'

/**
 * Mitik Suly: gözlüklü, kumral, tatlı bir kız (bot sahibinin isteği). Piksel değil vektördür; aynı 280 birimlik
 * kareye çizilir, galeride de aynı ölçekle küçülür.
 */
function sulyKiz() {
  const yildiz = (x, y, r) =>
    `<path d="M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z" fill="#fff6c9"/>`
  return `<g shape-rendering="geometricPrecision">
    ${yildiz(36, 52, 12)}${yildiz(244, 70, 9)}${yildiz(252, 196, 7)}${yildiz(26, 186, 6)}
    <path d="M52 168 Q44 62 140 50 Q236 62 228 168 Q234 236 214 262 L66 262 Q46 236 52 168 Z" fill="${SAC_KOYU}"/>
    <path d="M58 280 Q66 222 140 214 Q214 222 222 280 Z" fill="#ff7fb8"/>
    <path d="M112 216 Q140 236 168 216 L162 228 Q140 244 118 228 Z" fill="#ffffff" opacity="0.85"/>
    <rect x="125" y="186" width="30" height="34" rx="12" fill="${TEN}"/>
    <ellipse cx="140" cy="134" rx="64" ry="70" fill="${TEN}"/>
    <ellipse cx="78" cy="140" rx="9" ry="14" fill="${TEN}"/>
    <ellipse cx="202" cy="140" rx="9" ry="14" fill="${TEN}"/>
    <path d="M74 132 Q70 62 140 58 Q212 62 206 132 Q198 98 170 92 Q160 108 128 104 Q112 112 96 106 Q82 114 74 132 Z" fill="${SAC}"/>
    <path d="M74 128 Q62 176 70 222 Q58 190 60 150 Z" fill="${SAC}"/>
    <path d="M206 128 Q218 176 210 222 Q222 190 220 150 Z" fill="${SAC}"/>
    <path d="M118 66 Q130 60 146 64" stroke="#b07a52" stroke-width="5" fill="none" stroke-linecap="round"/>
    <circle cx="196" cy="88" r="9" fill="#ffd34d"/><circle cx="196" cy="88" r="4" fill="#ff8fd0"/>
    <path d="M100 124 Q113 118 126 124" stroke="${SAC_KOYU}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M154 124 Q167 118 180 124" stroke="${SAC_KOYU}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="113" cy="144" rx="9" ry="11" fill="#3b2316"/>
    <ellipse cx="167" cy="144" rx="9" ry="11" fill="#3b2316"/>
    <circle cx="116" cy="140" r="3.5" fill="#ffffff"/><circle cx="170" cy="140" r="3.5" fill="#ffffff"/>
    <circle cx="110" cy="148" r="1.8" fill="#ffffff"/><circle cx="164" cy="148" r="1.8" fill="#ffffff"/>
    <circle cx="113" cy="144" r="22" fill="#ffffff" fill-opacity="0.12" stroke="#2c2c34" stroke-width="5"/>
    <circle cx="167" cy="144" r="22" fill="#ffffff" fill-opacity="0.12" stroke="#2c2c34" stroke-width="5"/>
    <path d="M135 142 Q140 137 145 142" stroke="#2c2c34" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M91 140 L80 134" stroke="#2c2c34" stroke-width="4" stroke-linecap="round"/>
    <path d="M189 140 L200 134" stroke="#2c2c34" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="98" cy="174" rx="11" ry="6" fill="#ff8fa3" opacity="0.55"/>
    <ellipse cx="182" cy="174" rx="11" ry="6" fill="#ff8fa3" opacity="0.55"/>
    <path d="M138 162 Q140 166 142 162" stroke="#e0a98a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M126 178 Q140 192 154 178" stroke="#c9465f" stroke-width="4" fill="#ff9aac" stroke-linecap="round"/>
  </g>`
}

/** Şirket NFT'sine takım elbise yakası ve borsa kodu; logo çizilmez. */
function sirketEki(nft) {
  return `<g shape-rendering="geometricPrecision">
    <rect x="70" y="246" width="140" height="30" rx="8" fill="#0a1a33" stroke="#7fe3ff" stroke-width="3"/>
    <text x="140" y="269" font-family="DejaVu Sans" font-size="20" font-weight="bold" fill="#7fe3ff" text-anchor="middle">${nft.kod} ▲</text>
  </g>`
}

/** 280 birimlik kare içinde mahlukun SVG'si. */
function mahluk(nft) {
  if (nft.ozel === 'suly') return sulyKiz()
  const rnd = uretec(`nft|${nft.no}|${nft.ad}`)
  const renk = GOVDE[rnd(GOVDE.length)]
  const golge = GOVDE[rnd(GOVDE.length)]
  const p = (anahtar, dolgu) => {
    const [x, y] = anahtar.split(',').map(Number)
    return `<rect x="${x * 20}" y="${y * 20}" width="20.4" height="20.4" fill="${dolgu}"/>`
  }

  const parcalar = [...govde(rnd)].map(([k, golgeli]) => p(k, golgeli ? golge : renk))
  const gozY = 6 + rnd(2)
  const goz = nft.sinif === 'siradan' ? '#ffffff' : '#ff2e4d'
  for (const x of [4, 5, 8, 9]) parcalar.push(p(`${x},${gozY}`, goz))
  for (const x of [5, 8]) parcalar.push(p(`${x},${gozY}`, '#0d0d14'))
  const agizY = gozY + 3
  const genis = 1 + rnd(2)
  for (let x = 7 - genis; x < 7 + genis; x++) parcalar.push(p(`${x},${agizY}`, '#0d0d14'))
  parcalar.push(baslik(nft.sinif, rnd, p))
  if (nft.sinif === 'sirket') parcalar.push(sirketEki(nft))
  return parcalar.join('')
}

const zeminTanimi = Object.entries(ZEMIN)
  .map(([ad, [a, b]]) => `<linearGradient id="${ad}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`)
  .join('')

const yazi = (x, y, boy, metin, renk = '#ffffff', ek = '') =>
  `<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${boy}" fill="${renk}" ${ek}>${metin}</text>`

/** Tek NFT'nin kartı (PNG). */
export function nftKarti(nft) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="980" viewBox="0 0 800 980"><defs>${zeminTanimi}</defs>
    <rect width="800" height="980" fill="#0d0d14"/>
    <rect x="40" y="40" width="720" height="720" rx="36" fill="url(#${nft.sinif})"/>
    <g transform="translate(90 90) scale(2.214)" shape-rendering="crispEdges">${mahluk(nft)}</g>
    ${yazi(48, 840, 46, nft.ad, '#ffffff', 'font-weight="bold"')}
    ${yazi(48, 900, 32, `Suly Mahlukatı #${nft.no}`, '#9aa3b5')}
    ${yazi(752, 900, 32, NADIRLIK[nft.sinif].ad.slice(2).trim(), ZEMIN[nft.sinif][0], 'text-anchor="end" font-weight="bold"')}
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Bütün koleksiyon tek görselde; satılmış olanlar soluk. @param {Set<number>} satilan */
export function nftGalerisi(satilan = new Set()) {
  const SUTUN = 6
  const KUTU = 160
  const satir = Math.ceil(NFTLER.length / SUTUN)
  const kutular = NFTLER.map((n, i) => {
    const x = 20 + (i % SUTUN) * (KUTU + 12)
    const y = 20 + Math.floor(i / SUTUN) * (KUTU + 44)
    return `<g transform="translate(${x} ${y})" opacity="${satilan.has(n.no) ? 0.45 : 1}">
      <rect width="${KUTU}" height="${KUTU}" rx="16" fill="url(#${n.sinif})"/>
      <g transform="translate(10 10) scale(0.5)" shape-rendering="crispEdges">${mahluk(n)}</g>
      ${yazi(KUTU / 2, KUTU + 28, 24, `#${n.no}`, '#ffffff', 'text-anchor="middle" font-weight="bold"')}</g>`
  })
  const w = 40 + SUTUN * KUTU + (SUTUN - 1) * 12
  const h = 24 + satir * (KUTU + 44)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${zeminTanimi}</defs><rect width="${w}" height="${h}" fill="#0d0d14"/>${kutular.join('')}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Panelde gösterilen kare görsel (PNG); yazısız. */
export function nftGorseli(nft) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><defs>${zeminTanimi}</defs>
    <rect width="320" height="320" fill="url(#${nft.sinif})"/><g transform="translate(20 20)" shape-rendering="crispEdges">${mahluk(nft)}</g></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

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

const SAC = '#b8652e'
const SAC_KOYU = '#8c4520'
const SAC_ACIK = '#d9884a'
const TEN = '#f7d6bf'
const GOZLUK = '#cfd6e2'

/**
 * Mitik Suly (bot sahibinin isteği): bakır saçlı, şeffaf çerçeveli kedi gözü gözlüklü, burun halkalı, öpücük
 * atan bir kız. Fotoğraf saklanmaz ve kopyalanmaz, özellikler bu çizime aktarıldı. Piksel değil vektördür; aynı
 * 280 birimlik kareye çizilir, galeride de aynı ölçekle küçülür.
 */
function sulyKiz() {
  const yildiz = (x, y, r) =>
    `<path d="M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z" fill="#fff6c9"/>`
  const kalp = (x, y, r, renk) =>
    `<path d="M${x} ${y + r} C${x - r * 1.6} ${y - r * 0.2} ${x - r * 0.7} ${y - r * 1.4} ${x} ${y - r * 0.4} C${x + r * 0.7} ${y - r * 1.4} ${x + r * 1.6} ${y - r * 0.2} ${x} ${y + r} Z" fill="${renk}"/>`
  // Kedi gözü cam: dış üst köşe yukarı kalkık.
  const cam = (cx, yon) => {
    const ic = cx - 21 * yon
    const dis = cx + 23 * yon
    return `<path d="M${ic} 130 C${ic} 122 ${cx} 121 ${dis} 121 C${dis + 4 * yon} 132 ${dis + 2 * yon} 152 ${cx + 10 * yon} 162 C${cx - 6 * yon} 166 ${ic - 2 * yon} 158 ${ic} 130 Z" fill="#ffffff" fill-opacity="0.16" stroke="${GOZLUK}" stroke-width="3.5" stroke-linejoin="round"/>`
  }
  const goz = (cx, yon) => `
    <path d="M${cx - 13} 140 Q${cx} 122 ${cx + 13} 139 Q${cx} 131 ${cx - 13} 140 Z" fill="#9fbf6a" opacity="0.9"/>
    <ellipse cx="${cx}" cy="144" rx="8" ry="9.5" fill="#4a2a18"/>
    <circle cx="${cx + 2.5}" cy="140.5" r="3" fill="#ffffff"/>
    <path d="M${cx - 10 * yon} 142 Q${cx} 127 ${cx + 10 * yon} 141 Q${cx + 14 * yon} 139 ${cx + 17 * yon} 135" stroke="#1d1416" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M${cx - 13} 119 Q${cx} 112 ${cx + 13} 119" stroke="#8c4f2c" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
  const cil = (x, y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#d9967a"/>`
  return `<g shape-rendering="geometricPrecision">
    ${yildiz(36, 52, 12)}${yildiz(250, 64, 8)}${kalp(246, 196, 9, '#ff5d8f')}${kalp(30, 180, 7, '#ff8fb6')}
    <path d="M58 150 Q50 64 140 52 Q230 64 222 150 Q234 196 220 232 Q196 244 176 230 L104 230 Q84 244 60 232 Q46 196 58 150 Z" fill="${SAC_KOYU}"/>
    <path d="M54 280 Q62 222 140 212 Q218 222 226 280 Z" fill="#b3172f"/>
    <path d="M114 214 Q140 226 166 214" stroke="#8f0f24" stroke-width="5" fill="none" stroke-linecap="round"/>
    <rect x="126" y="186" width="28" height="32" rx="12" fill="${TEN}"/>
    <ellipse cx="140" cy="138" rx="60" ry="66" fill="${TEN}"/>
    <path d="M140 60 Q96 62 82 104 Q74 130 76 156 Q66 186 74 214 Q86 226 96 214 Q86 186 92 158 Q90 118 112 92 Q126 76 140 74 Z" fill="${SAC}"/>
    <path d="M140 60 Q184 62 198 104 Q206 130 204 156 Q214 186 206 214 Q194 226 184 214 Q194 186 188 158 Q190 118 168 92 Q154 76 140 74 Z" fill="${SAC}"/>
    <path d="M140 62 L140 76" stroke="${SAC_KOYU}" stroke-width="3" stroke-linecap="round"/>
    <path d="M116 70 Q100 82 94 104" stroke="${SAC_ACIK}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M166 70 Q182 82 188 104" stroke="${SAC_ACIK}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M80 196 Q72 206 80 216" stroke="${SAC_ACIK}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M200 196 Q208 206 200 216" stroke="${SAC_ACIK}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="203" cy="176" r="12" fill="none" stroke="#c9ced8" stroke-width="2.5"/>
    ${goz(113, -1)}${goz(167, 1)}
    ${cam(113, -1)}${cam(167, 1)}
    <path d="M135 142 Q140 138 145 142" stroke="${GOZLUK}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M89 126 L80 122" stroke="${GOZLUK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M191 126 L200 122" stroke="${GOZLUK}" stroke-width="4" stroke-linecap="round"/>
    ${cil(101, 166)}${cil(108, 170)}${cil(96, 172)}${cil(172, 170)}${cil(179, 166)}${cil(184, 172)}
    <ellipse cx="98" cy="178" rx="11" ry="6" fill="#ff8fa3" opacity="0.45"/>
    <ellipse cx="182" cy="178" rx="11" ry="6" fill="#ff8fa3" opacity="0.45"/>
    <path d="M136 164 Q140 170 146 165" stroke="#d9a284" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="146" cy="168" r="2.8" fill="none" stroke="#c9ced8" stroke-width="1.6"/>
    <path d="M128 184 Q134 176 140 180 Q146 176 152 184 Q146 194 140 192 Q134 194 128 184 Z" fill="#9e2438"/>
    <path d="M130 184 Q140 187 150 184" stroke="#6e1424" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M134 180 Q137 179 139 181" stroke="#ffffff" stroke-width="1.6" fill="none" opacity="0.6" stroke-linecap="round"/>
    ${kalp(166, 186, 5, '#ff5d8f')}
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

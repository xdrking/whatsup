// NFT görselleri: `no`'dan türeyen simetrik piksel mahluk. Rastgelelik fnv1a tohumludur,
// aynı no her zaman aynı görseli verir, dosya saklanmaz.
import sharp from 'sharp'
import { fnv1a } from './hash.js'
import { NADIRLIK, NFTLER } from './nft.js'

const IZGARA = 14
const ZEMIN = {
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
  if (sinif === 'efsane') {
    return ['4,2', '5,3', '6,2', '7,2', '8,3', '9,2', '4,3', '6,3', '7,3', '9,3', '4,1', '9,1'].map((k) => p(k, '#fff2a8')).join('')
  }
  if (sinif === 'nadir') return ['3,3', '4,3', '5,3', '6,3', '7,3', '8,3', '9,3', '10,3', '5,2', '6,2', '7,2', '8,2'].map((k) => p(k, '#16121f')).join('')
  return rnd(2) ? ['4,2', '9,2', '3,1', '10,1'].map((k) => p(k, '#ffffff')).join('') : ''
}

/** 280 birimlik kare içinde mahlukun SVG'si. */
function mahluk(nft) {
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

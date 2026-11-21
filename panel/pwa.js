// PWA parçaları (Faz 66): manifest ve ikon. İkon dosya olarak durmaz, ilk istekte
// SVG'den sharp ile üretilir ve bellekte kalır.
import sharp from 'sharp'

export const MANIFEST = JSON.stringify({
  name: 'Grup',
  short_name: 'Grup',
  start_url: '/s',
  scope: '/',
  display: 'standalone',
  background_color: '#f3f1ec',
  theme_color: '#f3f1ec',
  lang: 'tr',
  icons: [
    { src: '/ikon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/ikon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
})

// Maskelenebilir ikon: işaret ortadaki %60'lık güvenli alanda kalır.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#24395c"/>
<rect x="150" y="160" width="212" height="150" rx="22" fill="#f3f1ec"/>
<path d="M196 310 L196 360 L250 310 Z" fill="#f3f1ec"/>
<rect x="186" y="204" width="140" height="18" rx="9" fill="#24395c"/>
<rect x="186" y="246" width="92" height="18" rx="9" fill="#c8553d"/>
</svg>`

let hazir = null

/** @returns {Promise<Record<string, Buffer>>} adres → PNG */
export function ikonlar() {
  hazir ??= Promise.all([192, 512].map((b) => sharp(Buffer.from(SVG)).resize(b, b).png().toBuffer()))
    .then(([kucuk, buyuk]) => ({ '/ikon-192.png': kucuk, '/ikon-512.png': buyuk }))
  return hazir
}

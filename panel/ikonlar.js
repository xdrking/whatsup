// Sosyal bölümün çizgi simgeleri (Faz 71). Satır içi SVG'dir: CSP dış dosya ve satır içi stil
// istemez, SVG öznitelikleri serbesttir. Renk `currentColor`'dan gelir, boyut CSS'tedir (.ikon).
import { h } from './sayfalar.js'

const IKONLAR = {
  ev: h`<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>`,
  ara: h`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,
  mesaj: h`<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-10 6L2 7"/>`,
  zil: h`<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>`,
  kisiler: h`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  kalem: h`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`,
  oyun: h`<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6C2.6 9.4 2 14.5 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.4-1.4A2 2 0 0 1 9.8 16h4.4a2 2 0 0 1 1.4.6L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.5-.6-6.6-.7-7.3A4 4 0 0 0 17.3 5z"/>`,
  degistir: h`<path d="m8 3-4 4 4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>`,
  kalp: h`<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>`,
  yorum: h`<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>`,
  paylas: h`<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>`,
  alinti: h`<path d="M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.5-1.5 4-4 5"/><path d="M19 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.5-1.5 4-4 5"/>`,
  foto: h`<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>`,
  anket: h`<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>`,
  takvim: h`<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>`,
  gulumse: h`<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>`,
  arti: h`<path d="M12 5v14M5 12h14"/>`,
  gonder: h`<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>`,
  cikis: h`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>`,
  geri: h`<path d="m15 18-6-6 6-6"/>`,
  kayit: h`<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>`,
  pin: h`<path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2v2H6v-2z"/><path d="M8 4h8"/>`,
  kahve: h`<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/>`,
  ay: h`<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`,
  gunes: h`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  sil: h`<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>`,
  konum: h`<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>`,
}

/** `<svg>` simgesi; bilinmeyen ad boş döner. Ekran okuyucudan gizlidir, anlamı yanındaki yazı verir. */
export function ikon(ad, sinif = '') {
  const govde = IKONLAR[ad]
  if (!govde) return ''
  return h`<svg class="ikon${sinif ? ` ${sinif}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${govde}</svg>`
}

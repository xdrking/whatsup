// .market'in haftalık vitrini: stoğu sınırlı, kişi başı haftada bir satılan ürün.
import { fnv1a } from './hash.js'

const SAAT_MS = 60 * 60 * 1000

// `odul`, key ödülleriyle aynı biçimdedir; lib/stats.js:kasaAc() yazar.
// `kart` numarası lib/kart.js'teki nadir karttır.
export const VITRIN = [
  { ad: '👑 1 saat oyunlardan 10 kat XP', fiyat: 2000, stok: 3, odul: { bonus: 900 } },
  { ad: '🛡️ 7 gün soygun kalkanı', fiyat: 1500, stok: 2, odul: { kalkanMs: 7 * 24 * SAAT_MS } },
  { ad: '🎡 3 ücretsiz çark hakkı', fiyat: 270, stok: 5, odul: { carkHakki: 3 } },
  { ad: '🥷 Bugünlük 3 soygun hakkı', fiyat: 400, stok: 3, odul: { soygunHakki: 3 } },
  { ad: '🃏 Nadir kart: ⭐ Göbeklitepe', fiyat: 1500, stok: 2, odul: { kart: 12 } },
  { ad: '🃏 Nadir kart: ⭐ Zümrüdüanka', fiyat: 5000, stok: 1, odul: { kart: 18 } },
].map((u) => ({ ...u, tur: 'vitrin', odul: { ...u.odul, etiket: u.ad } }))

/** Vitrin haftaya göre döner; her grupta aynı ürün çıkar, stok grup başınadır. */
export function vitrinUrunu(hafta) {
  return VITRIN[fnv1a(hafta) % VITRIN.length]
}

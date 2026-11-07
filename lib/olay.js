// Piyasa olayları: her grupta 6 saatte bir değişen ekonomi havası. Olay hash'le seçilir,
// saklanmaz: bot yeniden başlasa da aynı dilimde aynı olay çıkar.
// Etkiler yüzdedir (100 = etkisiz). Coin kuruna dokunulmaz: krizde ucuz alıp bozdurmak XP basardı.
// Key fiyatına da dokunulmaz: indirimde key beklentisi fiyatın üstüne çıkardı.
import { fnv1a } from './hash.js'

export const OLAY_SAATI = 6
const OLAY_MS = OLAY_SAATI * 60 * 60 * 1000
// Dilimler İstanbul saatiyle 00, 06, 12, 18'de başlasın (UTC+3, yaz saati yok).
const ISTANBUL_FARKI_MS = 3 * 60 * 60 * 1000

export const OLAYLAR = [
  { kod: 'sakin', ad: '😐 Sakin piyasa', aciklama: 'Her şey normal.', agirlik: 30 },
  { kod: 'boom', ad: '📈 Ekonomik patlama', aciklama: 'Maaş ve kira 1,5 kat, yatırımlar daha çok kazandırır.', agirlik: 12, maas: 150, kira: 150, yatirim: 120 },
  { kod: 'kriz', ad: '📉 Ekonomik kriz', aciklama: 'Maaş ve kira %30 düşük, market %20 indirimli, yatırımlar daha az kazandırır.', agirlik: 12, maas: 70, kira: 70, market: 80, yatirim: 80 },
  { kod: 'festival', ad: '🎮 Oyun festivali', aciklama: 'Oyun ödülleri 2 kat.', agirlik: 12, oyun: 200 },
  { kod: 'karacuma', ad: '🛍️ Kara Cuma', aciklama: 'Market ürünleri %30 indirimli (key hariç).', agirlik: 10, market: 70 },
  { kod: 'emlak', ad: '🏠 Emlak patlaması', aciklama: 'Kira 2 kat.', agirlik: 10, kira: 200 },
  { kod: 'zam', ad: '💸 Zam yağmuru', aciklama: 'Market ürünleri %30 pahalı (key hariç).', agirlik: 8, market: 130 },
  { kod: 'grev', ad: '✊ Genel grev', aciklama: 'Maaşlar yarıya iner, oyun ödülleri 1,5 kat.', agirlik: 6, maas: 50, oyun: 150 },
]
const TOPLAM = OLAYLAR.reduce((t, o) => t + o.agirlik, 0)

export function olayDilimi(now) {
  return Math.floor((now + ISTANBUL_FARKI_MS) / OLAY_MS)
}

/** @returns {object} olay + `bitis` (ms) */
export function piyasaOlayi(chatJid, now) {
  const dilim = olayDilimi(now)
  let r = fnv1a(`${chatJid}|olay|${dilim}`) % TOPLAM
  let secilen = OLAYLAR[0]
  for (const o of OLAYLAR) {
    if (r < o.agirlik) { secilen = o; break }
    r -= o.agirlik
  }
  return { ...secilen, bitis: (dilim + 1) * OLAY_MS - ISTANBUL_FARKI_MS }
}

/** `alan` (maas, kira, market, oyun, yatirim) için etkiyi uygular. */
export function olayUygula(olay, alan, tutar) {
  return Math.round((tutar * (olay[alan] ?? 100)) / 100)
}

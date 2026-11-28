// Yönetim panelinden değişen sayısal ayarlar (Faz 90). Değer `ayar` tablosunda `yonetim:<anahtar>` olarak durur,
// yoksa koddaki varsayılan geçerlidir. Bot ve panel ayrı süreç olduğu için okunan değer 10 sn bellekte kalır:
// panelde değişen ayar bota en geç 10 sn sonra geçer.
import { getDb } from './db.js'
import logger from './logger.js'
import { ANAHTAR_BIRIKME, coinBeklentisi, HAFTALIK_ALIM, HAFTALIK_KUMAR, HAFTALIK_SOYGUN, kasaBul, KASALAR, KUMAR_DUSME, SOYGUN_DUSME } from './sandik.js'

const ONBELLEK_MS = 10_000

/** Yeni ayar bir satırdır; okuyan yer `ayarDeger(anahtar)` çağırır. */
export const AYARLAR = {
  kasaHaftalikKumar: { grup: 'kasa', ad: 'Kumardan haftalık bedava kasa', birim: 'kasa', varsayilan: HAFTALIK_KUMAR, en: 0, cok: 50 },
  kasaHaftalikSoygun: { grup: 'kasa', ad: 'Soygundan haftalık bedava kasa', birim: 'kasa', varsayilan: HAFTALIK_SOYGUN, en: 0, cok: 50 },
  kasaKumarDusme: { grup: 'kasa', ad: 'Kumar galibiyetinde düşme şansı', birim: '%', varsayilan: KUMAR_DUSME, en: 0, cok: 100 },
  kasaSoygunDusme: { grup: 'kasa', ad: 'Başarılı soygunda düşme şansı', birim: '%', varsayilan: SOYGUN_DUSME, en: 0, cok: 100 },
  kasaHaftalikAlim: { grup: 'kasa', ad: 'Coinle haftalık kasa alım sınırı', birim: 'kasa', varsayilan: HAFTALIK_ALIM, en: 0, cok: 1000 },
  kasaGecelikAnahtar: { grup: 'kasa', ad: 'Gecelik bedava anahtar', birim: 'açık/kapalı', varsayilan: 1, en: 0, cok: 1 },
  kasaAnahtarBirikme: { grup: 'kasa', ad: 'Gecelik anahtarın biriktiği gün', birim: 'gün', varsayilan: ANAHTAR_BIRIKME, en: 1, cok: 30 },
  kumarGunlukTavan: { grup: 'ekonomi', ad: 'Günlük kumar kazanç tavanı (piyasanın yüzdesi)', birim: '%', varsayilan: 50, en: 1, cok: 1000 },
  // Faz 93: uyarılar. Enflasyon günün açılış kuruna göre anlık kurun artışıdır; 0 kapalı demektir.
  uyariEnflasyon: { grup: 'uyari', ad: 'Günlük kur artışı uyarısı', birim: '%', varsayilan: 100, en: 0, cok: 100_000 },
  uyariBot: { grup: 'uyari', ad: 'Bot koptuğunda uyar', birim: 'açık/kapalı', varsayilan: 1, en: 0, cok: 1 },
  // Faz 93: fiyatlar. Market çarpanı yalnızca ürünlere işler, random key'lere değil: key'in beklenen XP'si fiyatının
  // altında kalmalı (test/ekonomi.test.js), ucuzlarsa key XP basardı. Kredi eki yalnızca yeni çekilen kredilere işler.
  marketFiyatKati: { grup: 'fiyat', ad: 'Market ürün fiyatı (key hariç)', birim: '%', varsayilan: 100, en: 25, cok: 1000 },
  krediFaizEk: { grup: 'fiyat', ad: 'Bütün kredilere ek faiz', birim: 'puan', varsayilan: 0, en: 0, cok: 20 },
  // Kasa fiyatı kasanın coin beklentisinin altına inemez: inseydi coinle kasa alıp açmak coin basardı.
  ...Object.fromEntries(KASALAR.flatMap((k) => [
    [`kasaFiyat${k.tier}`, { grup: 'fiyat', ad: `T${k.tier} ${k.ad.replace(/^\S+\s/, '')} fiyatı`, birim: 'coin', varsayilan: k.fiyat, en: Math.ceil(coinBeklentisi(k)), cok: 100_000 }],
    [`anahtarFiyat${k.tier}`, { grup: 'fiyat', ad: `T${k.tier} anahtar fiyatı`, birim: 'coin', varsayilan: k.anahtar, en: 1, cok: 100_000 }],
  ])),
}

/** Kasanın ve anahtarının geçerli coin fiyatı (Faz 93). */
export const kasaFiyati = (tier) => (kasaBul(tier) ? ayarDeger(`kasaFiyat${tier}`) : 0)
export const anahtarFiyati = (tier) => (kasaBul(tier) ? ayarDeger(`anahtarFiyat${tier}`) : 0)

let onbellek = null
let okunma = 0

function hepsiniOku(simdi) {
  if (onbellek && simdi - okunma < ONBELLEK_MS) return onbellek
  const yeni = new Map()
  try {
    for (const r of getDb()?.prepare("SELECT anahtar, deger FROM ayar WHERE anahtar LIKE 'yonetim:%'").all() ?? []) {
      yeni.set(r.anahtar.slice('yonetim:'.length), Number(r.deger))
    }
  } catch (err) {
    logger.error({ err }, 'Ayarlar okunamadı, varsayılanlar kullanılıyor')
  }
  onbellek = yeni
  okunma = simdi
  return yeni
}

/** Ayarın geçerli değeri; kayıtlı değer bozuk ya da sınır dışıysa varsayılan. */
export function ayarDeger(anahtar, simdi = Date.now()) {
  const t = AYARLAR[anahtar]
  if (!t) throw new Error(`Bilinmeyen ayar: ${anahtar}`)
  const d = hepsiniOku(simdi).get(anahtar)
  return Number.isInteger(d) && d >= t.en && d <= t.cok ? d : t.varsayilan
}

/** Yönetim panelinin ayar listesi. */
export const ayarListesi = (grup = null) => Object.entries(AYARLAR)
  .filter(([, t]) => !grup || t.grup === grup)
  .map(([anahtar, t]) => ({ anahtar, ...t, deger: ayarDeger(anahtar) }))

/** @returns {{ once: number, deger: number } | { hata: string }} */
export function ayarYaz(anahtar, metin) {
  const t = Object.hasOwn(AYARLAR, anahtar) ? AYARLAR[anahtar] : null
  if (!t) return { hata: 'Böyle bir ayar yok.' }
  const deger = Number(String(metin ?? '').trim())
  if (!Number.isInteger(deger) || deger < t.en || deger > t.cok) return { hata: `${t.ad}: ${t.en} ile ${t.cok} arasında tam sayı olmalı.` }
  const once = ayarDeger(anahtar)
  try {
    const db = getDb()
    if (!db) return { hata: 'Veritabanı kapalı.' }
    if (deger === t.varsayilan) db.prepare('DELETE FROM ayar WHERE anahtar = ?').run(`yonetim:${anahtar}`)
    else db.prepare('INSERT OR REPLACE INTO ayar (anahtar, deger) VALUES (?, ?)').run(`yonetim:${anahtar}`, String(deger))
  } catch (err) {
    logger.error({ err, anahtar }, 'Ayar yazılamadı')
    return { hata: 'Ayar yazılamadı.' }
  }
  onbellek = null
  return { once, deger }
}

/** Testler için: önbelleği boşaltır. */
export const ayarOnbellekSil = () => { onbellek = null }

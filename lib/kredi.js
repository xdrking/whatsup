// .kredi kuralları. Saf; yazma lib/stats.js'tedir.
// Faiz bankanınkinden yüksek olmalı, yoksa kredi çekip bankaya yatıran XP basar.
export const KREDI_FAIZ_YUZDESI = 19
// `.faizkararı` banka faizini değiştirince kredi faizi bu kadar üstünde kalır.
export const KREDI_FAIZ_FARKI = 4

/**
 * Banka faizi ondalıklı olabildiği için toplam yuvarlanır: 0.1 + 4 kayan noktada 4.1000…01 olmasın.
 * Banka faizi eksiyken kredi faizi KREDI_FAIZ_FARKI'nda durur: yoksa kredi bedava ya da kârlı olurdu.
 */
export const krediFaizi = (bankaFaizi, fark = KREDI_FAIZ_FARKI) => Math.round((Math.max(0, bankaFaizi) + fark) * 100) / 100
export const KREDI_VADE_SAATI = 12
export const MIN_VADE_SAATI = 1
// En düşük limit. Limit anlık kurla büyür (`krediLimiti`), kur ne kadar düşerse düşsün bunun altına inmez.
export const KREDI_LIMITI = 50_000
// Anlık kurun bu kadarı taban limittir: kur piyasanın yüzde biri olduğu için limit enflasyonla birlikte büyür.
export const KUR_LIMIT_ORANI = 0.05
export const MIN_KREDI = 100
export const IFLAS_YASAK_SAATI = 12
export const IFLAS_KREDI_YASAK_SAATI = 24

/**
 * Bankalar ve kredi ürünleri. Hepsi aynı merkez hazineden (botun kasası) verir, ödemeler oraya döner.
 * `no` kredi satırına `urun` olarak yazılır: sıra değiştirilmez, yeni ürün sona eklenir.
 * `fark`: banka faizinin kaç puan üstü (en az 1, yoksa kredi çekip bankaya yatıran XP basar).
 * `limitKat`: taban limitin katı. `ucret`: tahsis ücreti yüzdesi, peşin kesilir, hazineye gider.
 * `vade`: kullanıcının seçebileceği saat aralığı, 1-12 içinde.
 */
export const BANKALAR = [
  { kod: 'ziraat', ad: 'Ziraat Bankası', simge: '🌾', not: 'Kamu bankası: düşük faiz, uzun vade, küçük limit.' },
  { kod: 'garanti', ad: 'Garanti BBVA', simge: '🟢', not: 'Esnek vade, orta limit.' },
  { kod: 'teb', ad: 'TEB', simge: '🐦', not: 'Büyük limit, yüksek faiz.' },
  { kod: 'is', ad: 'İş Bankası', simge: '🔷', not: 'Dengeli ürünler.' },
  { kod: 'akbank', ad: 'Akbank', simge: '🔴', not: 'Hızlı ve kısa vadeli krediler.' },
  { kod: 'yapikredi', ad: 'Yapı Kredi', simge: '🟦', not: 'Ücretsiz tahsis, orta faiz.' },
]

export const KREDI_URUNLERI = [
  { no: 1, banka: 'ziraat', ad: 'Esnaf Kredisi', limitKat: 2, fark: 2, ucret: 1, vade: [4, 12] },
  { no: 2, banka: 'ziraat', ad: 'Çiftçi Destek', limitKat: 1, fark: 1.5, ucret: 0.5, vade: [6, 12] },
  { no: 3, banka: 'garanti', ad: 'Bonus İhtiyaç', limitKat: 5, fark: 4, ucret: 2, vade: [1, 12] },
  { no: 4, banka: 'garanti', ad: 'Hızlı Nakit', limitKat: 3, fark: 5, ucret: 0, vade: [1, 4] },
  { no: 5, banka: 'teb', ad: 'Mega Kredi', limitKat: 20, fark: 7, ucret: 3, vade: [2, 12] },
  { no: 6, banka: 'teb', ad: 'Girişimci', limitKat: 10, fark: 5.5, ucret: 2, vade: [3, 10] },
  { no: 7, banka: 'is', ad: 'Maxi İhtiyaç', limitKat: 8, fark: 4.5, ucret: 1.5, vade: [2, 12] },
  { no: 8, banka: 'is', ad: 'Bireysel Paket', limitKat: 4, fark: 3, ucret: 1, vade: [3, 8] },
  { no: 9, banka: 'akbank', ad: 'Anında Kredi', limitKat: 6, fark: 6, ucret: 0, vade: [1, 3] },
  { no: 10, banka: 'akbank', ad: 'Axess Nakit', limitKat: 12, fark: 6.5, ucret: 1, vade: [1, 6] },
  { no: 11, banka: 'yapikredi', ad: 'World Kredi', limitKat: 7, fark: 4, ucret: 0, vade: [2, 12] },
  { no: 12, banka: 'yapikredi', ad: 'Vadeli Avantaj', limitKat: 15, fark: 5, ucret: 0, vade: [6, 12] },
]

export const krediBankasi = (kod) => BANKALAR.find((b) => b.kod === kod)
export const krediUrunu = (no) => KREDI_URUNLERI.find((u) => u.no === Number(no))

/** Anlık kura göre taban limit, en az KREDI_LIMITI. */
export function krediLimiti(kur) {
  return Math.max(KREDI_LIMITI, Math.floor((Number(kur) || 0) * KUR_LIMIT_ORANI))
}

/** Ürünün limiti: taban limitin katı, kasanın yarısını geçemez. */
export function urunLimiti(urun, kur, kasa) {
  return azamiKredi(kasa, Math.floor(krediLimiti(kur) * urun.limitKat))
}

/** Tek kredi kasanın yarısını geçemez: verilen kadar XP kasada kalır. */
export function azamiKredi(kasa, limit = KREDI_LIMITI) {
  return Math.min(limit, Math.floor(kasa / 2))
}

/** Peşin kesilen tahsis ücreti, yukarı yuvarlanır. */
export const tahsisUcreti = (urun, miktar) => Math.ceil((miktar * urun.ucret) / 100)

/** `miktar` çekilip `vade` saatte ödenirse vadedeki borç (faiz saat başlarında işler). */
export const vadeBorcu = (miktar, vade, oran) => borcIslet(miktar, vade, oran)

/** `saat` tane saat başının bileşik faizi. Küsurat yukarı yuvarlanır, borç küçülmesin. */
export function borcIslet(borc, saat, oran = KREDI_FAIZ_YUZDESI) {
  return Math.ceil(borc * (1 + oran / 100) ** saat)
}

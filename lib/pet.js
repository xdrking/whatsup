// `.pet` kuralları: saf fonksiyonlar, zaman dışarıdan verilir (test).

export const SAAT_MS = 3_600_000

// Fiyatlar kur 2.300.000 iken geçerli XP'dir, `kurOlcegi()` ile büyür (market gibi).
export const TURLER = {
  kedi: { ad: 'Kedi', emoji: '🐱', fiyat: 500_000, carpan: 1 },
  kopek: { ad: 'Köpek', emoji: '🐶', fiyat: 500_000, carpan: 1 },
  tavsan: { ad: 'Tavşan', emoji: '🐰', fiyat: 300_000, carpan: 0.8 },
  kus: { ad: 'Kuş', emoji: '🐦', fiyat: 300_000, carpan: 0.8 },
  ejderha: { ad: 'Ejderha', emoji: '🐉', fiyat: 5_000_000, carpan: 2 },
}

export const MAMA_FIYATI = 100_000
export const MAMA_TOKLUK = 40
export const OYUN_MUTLULUK = 30
export const OYUN_BEKLEME_MS = SAAT_MS
export const HEDIYE_BEKLEME_MS = 24 * SAAT_MS
// Hediye için ikisi de bu eşiğin üstünde olmalı: aç ve mutsuz hayvan hediye getirmez.
export const HEDIYE_ESIGI = 30
// Tokluk 25 saatte, mutluluk 33 saatte biter.
export const TOKLUK_SAATLIK = 4
export const MUTLULUK_SAATLIK = 3
// Tokluk sıfıra indikten sonra bu kadar aç kalan hayvan kaçar.
export const KACMA_MS = 48 * SAAT_MS
export const AZAMI_SEVIYE = 20
export const BESLE_PET_XP = 10
export const OYNA_PET_XP = 15
export const AD_UZUNLUK = 20

/** "köpek", "Kopek", "KÖPEK" → 'kopek'. */
export function turBul(ham) {
  const k = String(ham || '').toLocaleLowerCase('tr')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ü/g, 'u').replace(/ı/g, 'i').replace(/ğ/g, 'g')
  return TURLER[k] ? k : null
}

/** WhatsApp biçim karakterleri atılır, satır sonu boşluk olur: ad kalın/italik metni bozmasın. */
export function adTemizle(ham) {
  return String(ham || '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, AD_UZUNLUK)
}

export const seviye = (petXp) => Math.min(AZAMI_SEVIYE, Math.floor(Math.sqrt(Math.max(0, petXp) / 30)))

/** Kaydedilmiş değerlerden şu anki tokluk ve mutluluk. Saklanmaz, her okumada hesaplanır. */
export function durum(pet, now) {
  const saat = Math.max(0, now - pet.guncelleme) / SAAT_MS
  return {
    tokluk: Math.max(0, pet.tokluk - saat * TOKLUK_SAATLIK),
    mutluluk: Math.max(0, pet.mutluluk - saat * MUTLULUK_SAATLIK),
  }
}

/** Hayvan kaçtı mı? Tokluğun sıfıra indiği andan `KACMA_MS` geçmişse. */
export function kactiMi(pet, now) {
  const acKaldigi = pet.guncelleme + (pet.tokluk / TOKLUK_SAATLIK) * SAAT_MS
  return now - acKaldigi >= KACMA_MS
}

/** Taban hediye, oyun ödülü gibi kurla büyür (`oyunOdulu`). Mutluluk oranında azalır. */
export function hediyeTabani(pet, d) {
  const tur = TURLER[pet.tur]
  return Math.max(1, Math.round((10 + 5 * seviye(pet.pet_xp)) * (d.mutluluk / 100) * tur.carpan))
}

export function ruhHali(d) {
  if (d.tokluk <= 0) return '😵 Açlıktan bayılmak üzere'
  if (d.tokluk < 25) return '🥺 Çok aç'
  if (d.mutluluk < 25) return '😿 Canı sıkılıyor'
  if (d.mutluluk >= 75 && d.tokluk >= 50) return '🥰 Çok mutlu'
  return '🙂 İyi'
}

export function cubuk(deger) {
  const dolu = Math.round(Math.max(0, Math.min(100, deger)) / 10)
  return `${'▰'.repeat(dolu)}${'▱'.repeat(10 - dolu)} ${Math.round(deger)}`
}

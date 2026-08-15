// FNV-1a: kriptografik değil, sadece "aynı girdiye hep aynı sayı" isteyen
// yerler için. `.ship` yüzdesi ve `.gününsözü` seed'i bunu kullanır; bot
// yeniden başlasa da sonuç değişmesin diye Math.random() kullanılmaz.
export function fnv1a(input) {
  let hash = 0x811c9dc5

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    // 32 bit çarpım; JS'te 2^53'ü aşmamak için Math.imul ile yapılır.
    hash = Math.imul(hash, 0x01000193)
  }

  // >>> 0: negatif sayıyı işaretsiz 32 bit'e çevirir.
  return hash >>> 0
}

// Tek seferlik sıfır atma (2005'teki YTL gibi): XP cinsinden her tutar `bolen`e bölünür.
// Coin ve mülk adedi coin cinsindendir, dokunulmaz: kur paradan hesaplandığı için kendiliğinden
// aynı oranda düşer, coinin XP karşılığı korunur. Hisse fiyatı sabit ölçeklidir (başlangıç 100,
// batma 5), bu yüzden fiyat değil pay adedi bölünür.
// Enflasyonu durdurmaz, yalnızca rakamları küçültür.

// [tablo, sütunlar]. Yeni bir XP tutarı tutan sütun eklenirse buraya yazılır.
export const SIFIR_AT_SUTUNLARI = [
  ['stats', ['xp']],
  ['banka', ['bakiye', 'bekleyen', 'faiz_artik', 'son_vergi']],
  ['kredi', ['borc']],
  ['tefeci', ['anapara', 'borc']],
  ['yatirim', ['miktar']],
  ['piyango', ['xp']],
  ['odul', ['xp']],
  ['cete', ['kasa']],
  ['hapis', ['kefalet']],
  ['mulk', ['bekleyen']],
  ['portfoy', ['adet', 'maliyet']],
  ['ekonomi', ['arz', 'kur']],
  ['maas_gun', ['toplam']],
  ['vergi', ['toplam']],
  ['vergi_kacak', ['tutar']],
  ['kumar', ['won', 'lost']],
  ['kumar_oyun', ['won', 'lost', 'en_buyuk', 'en_kotu']],
  ['kumar_gun', ['net', 'tavan']],
  ['gecmis', ['xp']],
]

/**
 * Tek transaction'dır, yarıda kalırsa hiçbir şey değişmez. `chat` verilirse yalnızca o grup.
 * Tamsayı sütunlarda SQLite tam sayı bölmesi yapar (sıfıra doğru), REAL sütunlar ondalıklı kalır.
 * @returns {Record<string, number>} tablo başına değişen satır
 */
export function sifirAt(db, { bolen = 1000, chat = null } = {}) {
  if (!Number.isInteger(bolen) || bolen < 2) throw new Error(`geçersiz bölen: ${bolen}`)
  const tabloVar = (ad) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(ad)
  const sonuc = {}

  db.transaction(() => {
    for (const [tablo, sutunlar] of SIFIR_AT_SUTUNLARI) {
      if (!tabloVar(tablo)) continue
      // Bölen metne tamsayı olarak yazılır: parametre olarak bağlansa better-sqlite3 REAL verir,
      // INTEGER sütun da ondalıklı bölünürdü. Yukarıda tamsayı olduğu denetlendi.
      const atama = sutunlar.map((s) => `${s} = ${s} / ${bolen}`).join(', ')
      const sql = `UPDATE ${tablo} SET ${atama}${chat ? ' WHERE chat_jid = ?' : ''}`
      sonuc[tablo] = db.prepare(sql).run(...(chat ? [chat] : [])).changes
    }
  })()

  return sonuc
}

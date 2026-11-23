// Reborn: grubun ekonomisi sıfırdan başlar (bot sahibinin kararı, enflasyon rakamları anlamsızlaştırınca).
// Enflasyonu durdurmaz, saati başa sarar: maaş, kira ve faiz aynı kurallarla yeniden büyür.
// Kurallar burada saftır, yazma lib/stats.js:rebornYap()'tadır.
import { trLower } from './turkishWords.js'

export const REBORN_SURE_MS = 10 * 60_000

// Reborn'dan sonraki ilk saatlerde `.crash`'te herkesin kaybeden çekilişi bu olasılıkla bir kez daha
// atılır (lib/kumar.js:sansliCevir). Gizlidir (bot sahibinin kararı): duyuru yalnızca "bazı kumar
// oyunlarında şans artar" der, oyunun adı hiçbir mesajda, `.help`'te ya da panelde yazılmaz.
export const REBORN_SANS_MS = 6 * 3_600_000
export const REBORN_CRASH_SANSI = 0.25

// Hazine sıfırdan başlamaz: kredi kasadan verilir (lib/kredi.js:azamiKredi), boş kasa krediyi kapatırdı.
export const HAZINE_TOHUMU = 1_000_000

// Profilde kalıcı yıldız alan, reborn anındaki en zengin kişi sayısı.
export const YILDIZ_ADEDI = 3

// Grubun satırları tümüyle silinen tablolar: para, paradan türeyen her şey ve meslek.
// Kalanlar bilerek yok: sayaçlar, kart, pet, evlilik, makam, unvan (market), kumar karnesi, şampiyonluk, çete üyeliği.
// Yeni bir para tablosu eklenirse buraya yazılır; test listedeki tabloların şemada olduğunu denetler.
export const SILINEN_TABLOLAR = [
  'banka', 'kredi', 'tefeci', 'yatirim', 'piyango', 'odul', 'coin', 'kripto', 'mulk', 'portfoy',
  'karaborsa', 'hack', 'cete_silah', 'cete_baskin', 'nft',
  'offshore', 'hack_kayit', 'fidye', 'maske', 'vurgun',
  'hapis', 'iflas', 'sigorta', 'meslek', 'meslek_biten',
  'ekonomi', 'maas_gun', 'vergi', 'vergi_kacak', 'kumar_gun', 'hazine_aktarim',
]

const EVET = ['evet', 'e', 'olur', 'kabul', 'destek', '👍']
const HAYIR = ['hayır', 'hayir', 'h', 'olmaz', 'red', 'ret', 'karşı', 'karsi', '👎']

/** Oylama yanıtı: 'evet', 'hayir' ya da anlaşılmazsa null. */
export function rebornOyu(metin) {
  const a = trLower(String(metin || '').trim()).replace(/[.!]+$/, '')
  if (EVET.includes(a)) return 'evet'
  if (HAYIR.includes(a)) return 'hayir'
  return null
}

/** Eşitlik ve oysuz oylama reborn getirmez: kimsenin istemediği sıfırlama olmasın. */
export const rebornKabul = (evet, hayir) => evet > hayir

// .sulymarket: Suly ile alışveriş yapılan oyun içi kara borsa. Kurallar burada saftır, yazma
// lib/stats.js'in sonundaki kara borsa bölümündedir. Yeni ürün = URUNLER'e bir satır.
// `kod` veritabanına yazılır, değiştirilmez. `fiyat` tabandır, satışta `marketKati()` ile çarpılır. Ödenen Suly yanar.
import { trLower } from './turkishWords.js'
import { elKoymaPayi } from './devlet.js'
import { nftBul } from './nft.js'
import { binlik } from './sayi.js'
import { KUTU_HAPIS_SAATI } from './yeralti.js'

const GUN_MS = 24 * 60 * 60 * 1000

export const HACK_GUNLUK = 2
export const HACK_KORUNMA_MS = 12 * 60 * 60 * 1000
// Duvar 24 saattir ve süresi bitmeden yenisi alınmaz (bot sahibinin kararı): 3 gün ucuz kalıyordu.
export const DUVAR_MS = GUN_MS
// Hileli zar: alındığı an başlar, bitmeden yenisi alınmaz. Tek elde biten kumarda kaybeden çekiliş bu olasılıkla
// bir kez daha atılır, iyisi kalır (sahip şansıyla aynı yol). Beklenen dönüş %100'ü geçer, bilerek: pahalıdır.
export const ZAR_MS = 2 * 60 * 60 * 1000
export const ZAR_SANSI = 50
// Süreli ürünler (`tur: 'sure'`) alındığı an başlar, `sureli` tablosuna yazılır, bitmeden yenisi alınmaz.
export const SOGUK_CUZDAN_MS = 12 * 60 * 60 * 1000
export const MAKINE_MS = 30 * 60 * 1000
export const MAKINE_SANSI = 60
// Mantık bombası hedefin bir sonraki banka çekiminin bu yüzdesini kuranın bankasına aktarır, kurulduktan sonra bu kadar bekler.
export const MANTIK_YUZDE = 10
export const MANTIK_MS = 3 * 24 * 60 * 60 * 1000
// Korsan yayın kişi başı günde bir; metin uzunluğu sınırı.
export const KORSAN_MS = 24 * 60 * 60 * 1000
export const KORSAN_AZAMI = 300
// Sahte ihbar: hedef bu kadar gözaltında (hapiste) kalır; VPN'siz ihbarcı bu olasılıkla kendisi içeri girer.
export const IHBAR_SAATI = 0.5
export const IHBAR_YAKALANMA = 30
export const IHBAR_CEZA_SAATI = 1
export const AZAMI_ADET = 1000

// Market, en zengin ZENGIN_SAYISI üyenin ortalama serveti SERVET_REFERANS Suly iken taban fiyattan satar.
export const ZENGIN_SAYISI = 10
export const SERVET_REFERANS = 400

/**
 * Anlık fiyat katı (bot sahibinin kararı). Servetin çoğu coin ve mülkte durduğu, Suly'nin XP fiyatı da günün
 * açılış kuruna bağlı olduğu için sabit Suly fiyatı enflasyonda bedava kalıyordu. Taban fiyatın altına inmez.
 * Onda bire yuvarlanır: fiyatlar 5'in katı olduğu için tam ya da buçuklu Suly çıkar.
 */
export function marketKati({ ortalama, sulyXp }) {
  const servet = sulyXp > 0 ? ortalama / sulyXp / SERVET_REFERANS : 0
  return Math.round(Math.max(1, servet) * 10) / 10
}

/** Taban fiyatın o andaki karşılığı, tam Suly. */
export const katliFiyat = (fiyat, kat = 1) => Math.ceil(Math.round(fiyat * kat * 10) / 10)

// Hacker tek kullanımlıktır. `delme` güvenlik duvarını delme şansıdır (yüzde): delinen duvar kırılır,
// delemeyen hacker ve günün hakkı yanar, hapis yoktur. Yüzdeler kurbanın bankası, cüzdanı ve coininden alınan paydır,
// `mulkPayi` mülk adedinin payı (en az bir mülk: `mulkEnAz`). Çalınan para hackleyenin bankasına girer.
export const HACKERLAR = [
  { kod: 'caylak', adlar: ['çaylak', 'caylak'], banka: 10, cuzdan: 0, coin: 0, mulkPayi: 0, mulkEnAz: 0, nft: false, sans: 45 },
  { kod: 'usta', adlar: ['usta'], banka: 20, cuzdan: 10, coin: 0, mulkPayi: 0, mulkEnAz: 1, nft: false, sans: 55 },
  { kod: 'karasapka', adlar: ['karaşapka', 'karasapka', 'kara'], banka: 30, cuzdan: 20, coin: 20, mulkPayi: 1 / 3, mulkEnAz: 1, nft: true, sans: 65, delme: 0 },
  { kod: 'elit', adlar: ['elit'], banka: 40, cuzdan: 30, coin: 30, mulkPayi: 1 / 2, mulkEnAz: 1, nft: true, sans: 72, delme: 50 },
  { kod: 'zeroday', adlar: ['zeroday', 'zero', 'sıfırgün', 'sifirgun'], banka: 50, cuzdan: 40, coin: 40, mulkPayi: 2 / 3, mulkEnAz: 1, nft: true, sans: 80, delme: 100 },
]
// HACKERLAR zayıftan güçlüye sıralıdır: elde hacker yazılmazsa en güçlüsü kullanılır.

const MULK_PAYI_METNI = new Map([[1 / 3, 'mülklerin üçte biri'], [1 / 2, 'mülklerin yarısı'], [2 / 3, 'mülklerin üçte ikisi']])

// tur: silah (çetenin cephaneliğine girer), hacker ve arac (kişinin envanterine girer), duvar ve zar (alındığı
// an başlar, bitmeden yenisi alınmaz), kutu (alındığı an açılır, tek tek alınır). Yeni ürün sona eklenir: liste numarası kaymasın.
export const URUNLER = [
  { kod: 'musta', tur: 'silah', ad: '👊 Muşta', fiyat: 5, guc: 2 },
  { kod: 'tabanca', tur: 'silah', ad: '🔫 Tabanca', fiyat: 15, guc: 8 },
  { kod: 'pompali', tur: 'silah', ad: '💥 Pompalı', fiyat: 40, guc: 24 },
  { kod: 'zirhli', tur: 'silah', ad: '🚙 Zırhlı araç', fiyat: 120, guc: 80 },
  { kod: 'roket', tur: 'silah', ad: '🚀 Roketatar', fiyat: 300, guc: 220 },
  { kod: 'bomba', tur: 'silah', ad: '💣 Bomba', fiyat: 60, guc: 0, patlama: 60, not: 'baskında patlar, +60 güç' },
  { kod: 'caylak', tur: 'hacker', ad: '👶 Çaylak hacker', fiyat: 50 },
  { kod: 'usta', tur: 'hacker', ad: '🧑‍💻 Usta hacker', fiyat: 160 },
  { kod: 'karasapka', tur: 'hacker', ad: '🎩 Kara şapka', fiyat: 450 },
  { kod: 'vpn', tur: 'arac', ad: '🛰️ VPN', fiyat: 15, not: 'sonraki saldırında izini siler, hapisten korur' },
  { kod: 'duvar', tur: 'duvar', ad: '🧱 Güvenlik duvarı', fiyat: 40, not: '24 saat hacklenemezsin; zero-day deler, elit %50 deler' },
  { kod: 'cilingir', tur: 'arac', ad: '🗝️ Çilingir', fiyat: 25, not: 'birinin soygun kalkanını kırar' },
  { kod: 'firar', tur: 'arac', ad: '🪪 Firar planı', fiyat: 20, not: 'hapisten kaçırır' },
  { kod: 'fidye', tur: 'arac', ad: '🔒 Fidye yazılımı', fiyat: 80, not: 'bankayı 6 saat kilitler, fidyeyi sen alırsın' },
  { kod: 'kimlik', tur: 'arac', ad: '🎭 Sahte kimlik', fiyat: 15, not: '1 saat soygunda adın görünmez' },
  { kod: 'kutu', tur: 'kutu', ad: '📦 Gizemli kutu', fiyat: 25, not: 'silah, hacker, NFT... ya da polis' },
  { kod: 'elit', tur: 'hacker', ad: '🕵️ Elit hacker', fiyat: 900 },
  { kod: 'zeroday', tur: 'hacker', ad: '☠️ Zero-day', fiyat: 1800 },
  { kod: 'emp', tur: 'arac', ad: '⚡ EMP bombası', fiyat: 120, not: 'birinin güvenlik duvarını yakar' },
  { kod: 'rusvet', tur: 'arac', ad: '💼 Rüşvet çantası', fiyat: 150, not: 'açık hack dosyalarını sildirir, .izsür seni bulamaz' },
  { kod: 'pasaport', tur: 'arac', ad: '🛂 Sahte pasaport', fiyat: 100, not: 'ambargoyu kaldırır' },
  { kod: 'zar', tur: 'zar', ad: '🎲 Hileli zar', fiyat: 2500, not: `${ZAR_MS / 3_600_000} saat kumarda kaybeden el %${ZAR_SANSI} yeniden atılır` },
  { kod: 'mantik', tur: 'arac', ad: '💣 Mantık bombası', fiyat: 180, not: `hedefin sonraki banka çekiminin %${MANTIK_YUZDE}'u senin bankana` },
  { kod: 'kimlikhirsiz', tur: 'arac', ad: '🎭 Kimlik hırsızlığı', fiyat: 250, not: 'sonraki başarılı hack ya da fidyede suç başka birine atılır' },
  { kod: 'casus', tur: 'arac', ad: '🕵️ Casus yazılımı', fiyat: 60, not: 'hedefin parasını, coinini, duvarını özelden raporlar' },
  { kod: 'sogukcuzdan', tur: 'sure', ad: '🔐 Soğuk cüzdan', fiyat: 200, sure: SOGUK_CUZDAN_MS, not: `${SOGUK_CUZDAN_MS / 3_600_000} saat hack coinini ve NFT'ni alamaz` },
  { kod: 'makine', tur: 'sure', ad: '🎰 Ayarlı makine', fiyat: 1200, sure: MAKINE_MS, not: `${MAKINE_MS / 60_000} dk slotta kaybeden çevirme %${MAKINE_SANSI} yeniden döner` },
  { kod: 'nazar', tur: 'arac', ad: '🧿 Nazar boncuğu', fiyat: 400, not: 'sonraki kaybettiğin bahsin yarısı geri gelir' },
  { kod: 'korsan', tur: 'arac', ad: '📢 Korsan yayın', fiyat: 50, not: 'gruba adsız duyuru, günde bir' },
  { kod: 'ihbar', tur: 'arac', ad: '🚔 Sahte ihbar', fiyat: 150, not: `hedef ${IHBAR_SAATI * 60} dk gözaltı; VPN'sizsen %${IHBAR_YAKALANMA} sen yakalanırsın` },
]

export const urunKoduyla = (kod) => URUNLER.find((u) => u.kod === kod) ?? null

/** Kutudan çıkanın metni; panel de kullanır. */
export function kutuMetni(k) {
  if (k.bos) return '📦 Kutudan eski bir ayakkabı çıktı.'
  if (k.hapis) return `🚨 Kutu polis tuzağıymış! ${KUTU_HAPIS_SAATI} saat hapis, kefalet ${binlik(k.hapis.kefalet)} XP.`
  if (k.nft) return `🖼️ Kutudan NFT çıktı: ${nftBul(k.nft).ad} #${k.nft}`
  return `📦 Kutudan ${urunKoduyla(k.kod).ad}${k.adet > 1 ? ` x${k.adet}` : ''} çıktı${k.cete ? `, ${k.cete} cephaneliğine girdi` : ''}.`
}

/** Vitrinde ürünün yanında yazan kısa açıklama; `.sulymarket` ve panel ortak kullanır. */
export function urunNotu(u) {
  const h = u.tur === 'hacker' && HACKERLAR.find((x) => x.kod === u.kod)
  if (!h) return u.not ?? `güç ${u.guc}`
  const pay = [
    `banka %${h.banka}`,
    ...(h.cuzdan ? [`cüzdan %${h.cuzdan}`] : []),
    ...(h.coin ? [`coin %${h.coin}`] : []),
    ...(h.mulkPayi ? [MULK_PAYI_METNI.get(h.mulkPayi) ?? `mülklerin %${Math.round(h.mulkPayi * 100)}'i`] : h.mulkEnAz ? ['1 mülk'] : []),
    ...(h.nft ? ['1 NFT'] : []),
  ]
  const duvar = h.delme >= 100 ? ', duvarı deler' : h.delme ? `, duvarı %${h.delme} deler` : ''
  return `${pay.join(' + ')}, başarı %${h.sans}${duvar}`
}

/**
 * Hileli zarın çekilişi: kaybeden çekiliş `olasilik` yüzdesiyle bir kez daha atılır, iyisi kalır. lib/kumar.js'teki
 * sansliCevir'in aynısıdır; kumar.js stats.js'i çağırdığı için buradan import edilmez.
 */
export function zarliCevir(cevir, olasilik, rnd) {
  return (miktar) => {
    const ilk = cevir(miktar)
    if (ilk.carpan >= 1 || rnd(100) >= olasilik) return ilk
    const ikinci = cevir(miktar)
    return ikinci.carpan > ilk.carpan ? ikinci : ilk
  }
}

export function hackerBul(ad) {
  const a = trLower(ad || '')
  return HACKERLAR.find((h) => h.adlar.includes(a)) ?? null
}

/** Hacker'ın alacağı pay. Mülk en pahalıdan başlar. */
export function hackPayi(hacker, { banka, cuzdan, coin, mulkler }) {
  const yuzde = { banka: hacker.banka, cuzdan: hacker.cuzdan, coin: hacker.coin, suly: 0 }
  const toplam = mulkler.reduce((t, m) => t + Math.max(0, m.adet), 0)
  const adet = Math.min(toplam, Math.max(hacker.mulkEnAz, Math.floor(toplam * hacker.mulkPayi + 1e-9)))
  const pay = elKoymaPayi({ banka, cuzdan: Math.max(0, cuzdan), coin, mulkler }, yuzde, toplam ? adet / toplam : 0)
  return { banka: pay.banka, cuzdan: pay.cuzdan, coin: pay.coin, mulkler: pay.mulkler }
}

// --- Çete cephaneliği ---

export const UYE_GUCU = 5
export const BASKIN_ARALIGI_MS = 6 * 60 * 60 * 1000
export const BASKIN_KORUNMA_MS = 12 * 60 * 60 * 1000
export const BASKIN_AZAMI_BOMBA = 3
export const GANIMET_YUZDESI = 20
export const KAYBEDEN_KAYIP_YUZDESI = 25
export const KAZANAN_KAYIP_YUZDESI = 5
const SOYGUN_BONUS_TAVANI = 10
const SOYGUN_BONUS_BOLEN = 40

/** @param {{ kod: string, adet: number }[]} silahlar */
export function silahGucu(silahlar) {
  return silahlar.reduce((t, s) => t + s.adet * (urunKoduyla(s.kod)?.guc ?? 0), 0)
}

export const ceteGucu = (uye, silahlar) => uye * UYE_GUCU + silahGucu(silahlar)

/** Çete silahlandıkça üyelerin `.soygun` şansına eklenen yüzde puanı. */
export function soygunBonusu(guc) {
  return Math.min(SOYGUN_BONUS_TAVANI, Math.floor(guc / SOYGUN_BONUS_BOLEN))
}

/** Güç oranı; %10-90: zayıf çetenin hep umudu, güçlünün hep riski olsun. */
export function baskinSansi(saldiran, savunan) {
  return Math.min(90, Math.max(10, Math.round((100 * saldiran) / Math.max(1, saldiran + savunan))))
}

/** Kaybedilen silah adedi; küsurat zarla yuvarlanır, yoksa tek silahlı çete hiç kaybetmezdi. */
export function silahKaybi(adet, yuzde, rnd) {
  const toplam = adet * yuzde
  return Math.floor(toplam / 100) + (rnd(100) < toplam % 100 ? 1 : 0)
}

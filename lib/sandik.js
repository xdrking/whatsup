// Kasalar (Faz 89): 5 tier kasa ve anahtar. Kasa aynı tier'den bir anahtarla açılır. Saf; yazma lib/stats.js'tedir.
// `.market`'teki XP'yle alınan random key'ler (lib/kasa.js, Faz 23) ayrı bir sistemdir, bu kasalar coin ekonomisindedir.
import { randomInt } from 'node:crypto'
import { NFTLER } from './nft.js'
import { SETLER } from './kart.js'

// Bir kişinin haftada bedava kazanabileceği kasa: kumar galibiyetinden 3, başarılı soygundan 2 (bot sahibinin kararı).
export const HAFTALIK_KUMAR = 3
export const HAFTALIK_SOYGUN = 2
// WhatsApp kumarında kazanılan elde ve başarılı soygunda kasa düşme olasılığı (yüzde).
export const KUMAR_DUSME = 4
export const SOYGUN_DUSME = 25
// Coinle haftada en çok bu kadar kasa alınır; anahtar sınırsızdır.
// Buradaki sayılar varsayılandır, yönetim panelinden değişir (lib/ayarlar.js, Faz 90).
export const HAFTALIK_ALIM = 7
// Her gece herkese 1 anahtar; girmeyenin anahtarı en çok bu kadar gün birikir.
export const ANAHTAR_BIRIKME = 7

// Renk CS kasalarındaki nadirlik sırasıdır: mavi en sık, altın en nadir. Şeritte ve WhatsApp mesajında görünür.
export const RENKLER = {
  mavi: { ad: 'Yaygın', emoji: '🟦' },
  mor: { ad: 'Seçkin', emoji: '🟪' },
  pembe: { ad: 'Gizli', emoji: '🩷' },
  kirmizi: { ad: 'Efsane', emoji: '🟥' },
  altin: { ad: 'Mistik', emoji: '🟨' },
}

const coin = (adet, agirlik, renk) => ({ tur: 'coin', adet, agirlik, renk, etiket: `🪙 ${adet} coin` })
const kart = (set, agirlik, renk = 'mor') => ({ tur: 'kart', set, agirlik, renk, etiket: `🃏 ${SETLER[set].ad} kartı` })
const unvan = (ad, agirlik, yedek, renk = 'pembe') => ({ tur: 'unvan', unvan: ad, yedek, agirlik, renk, etiket: `🏷️ Unvan: ${ad}` })
// NFT ödülü: o sınıftan grupta sahibi olmayan biri gelir; hepsi satılmışsa `yedek` coin verilir.
const nft = (sinif, agirlik, yedek, renk) => ({ tur: 'nft', sinif, yedek, agirlik, renk, etiket: `🖼️ ${sinifAdi(sinif)} NFT` })
const nftNo = (no, agirlik, yedek) => ({
  tur: 'nft', no, yedek, agirlik, renk: 'altin', etiket: `🖼️ ${NFTLER[no - 1].ad} (#${no})`,
})
const sinifAdi = (s) => ({ siradan: 'Sıradan', nadir: 'Nadir', efsane: 'Efsane', sirket: 'Mavi Çip', mistik: 'Mistik' })[s]

const SULY_NFT = NFTLER.find((n) => n.sinif === 'mistik').no

// Ağırlıkların toplamı 1000'dir: ağırlık / 10 = yüzde. Coin ödüllerinin beklentisi kasa ve anahtarın
// fiyatının altında kalmalı (test/sandik.test.js): kasa coinle alınır, beklenti fiyatı geçerse coin basılırdı.
export const KASALAR = [
  {
    tier: 1, ad: '📦 Çaylak Kasası', fiyat: 10, anahtar: 3,
    oduller: [coin(5, 400, 'mavi'), coin(8, 300, 'mavi'), kart(0, 130), coin(15, 120, 'mor'),
      unvan('📦 Kasa Çırağı', 30, 8), nft('siradan', 15, 10, 'pembe'), coin(60, 5, 'kirmizi')],
  },
  {
    tier: 2, ad: '🎁 Asker Kasası', fiyat: 25, anahtar: 6,
    oduller: [coin(10, 400, 'mavi'), coin(18, 280, 'mavi'), kart(1, 130), coin(35, 120, 'mor'),
      unvan('🎖️ Asker', 35, 20), nft('nadir', 25, 30, 'pembe'), coin(150, 10, 'kirmizi')],
  },
  {
    tier: 3, ad: '🧰 Elit Kasası', fiyat: 50, anahtar: 12,
    oduller: [coin(20, 400, 'mavi'), coin(35, 280, 'mavi'), kart(1, 120), coin(70, 130, 'mor'),
      unvan('💠 Elit', 30, 40), nft('nadir', 25, 30, 'pembe'), nft('efsane', 5, 100, 'kirmizi'), coin(300, 10, 'kirmizi')],
  },
  {
    tier: 4, ad: '💼 Efsane Kasası', fiyat: 100, anahtar: 20,
    oduller: [coin(40, 400, 'mavi'), coin(70, 280, 'mavi'), kart(2, 120), coin(140, 140, 'mor'),
      unvan('🐉 Efsane Avcısı', 25, 80), nft('efsane', 15, 100, 'kirmizi'), nft('sirket', 10, 300, 'kirmizi'), coin(500, 10, 'altin')],
  },
  {
    tier: 5, ad: '🔮 Mistik Kasası', fiyat: 200, anahtar: 40,
    oduller: [coin(80, 400, 'mavi'), coin(140, 280, 'mavi'), kart(2, 100), coin(280, 150, 'mor'),
      unvan('🔮 Mistik', 30, 150), nft('efsane', 20, 100, 'kirmizi'), nft('sirket', 12, 300, 'kirmizi'),
      coin(1000, 7, 'altin'), nftNo(SULY_NFT, 1, 1500)],
  },
]

export const kasaBul = (tier) => KASALAR.find((k) => k.tier === Number(tier)) ?? null

/** Tier'i yazıdan bulur: "3", "t3", "elit", "elit kasası". */
export function tierCoz(yazi) {
  const k = String(yazi ?? '').toLocaleLowerCase('tr').replace(/^t(?=\d)/, '').trim()
  if (/^[1-5]$/.test(k)) return Number(k)
  const bulunan = KASALAR.find((x) => x.ad.toLocaleLowerCase('tr').includes(k) && k.length >= 3)
  return bulunan?.tier ?? null
}

function agirlikli(liste, rnd) {
  let r = rnd(liste.reduce((t, o) => t + o.agirlik, 0))
  for (const o of liste) {
    if (r < o.agirlik) return o
    r -= o.agirlik
  }
  return liste[0]
}

/** Kasadan ödül çeker. */
export const odulCek = (kasa, rnd = randomInt) => agirlikli(kasa.oduller, rnd)

// Bedava gelen kasa ve anahtarın tier'i: düşük tier sık, Mistik nadir.
const TIER_AGIRLIK = [450, 300, 150, 80, 20]
// `azami`: en yüksek tier; sahibin dağıtımı Mistik vermez (bot sahibinin kararı).
export const rastgeleTier = (rnd = randomInt, azami = 5) =>
  agirlikli(TIER_AGIRLIK.slice(0, azami).map((agirlik, i) => ({ tier: i + 1, agirlik })), rnd).tier
// Sahibin `.kasa dağıt`'ı: herkese bu tier'e kadar rastgele 1 kasa.
export const DAGITIM_AZAMI_TIER = 4

/** Coin ödüllerinin beklentisi (NFT ve unvanın yedek coini dahil). */
export function coinBeklentisi(kasa) {
  const toplam = kasa.oduller.reduce((t, o) => t + o.agirlik, 0)
  return kasa.oduller.reduce((t, o) => t + (o.tur === 'coin' ? o.adet : o.yedek ?? 0) * o.agirlik, 0) / toplam
}

/**
 * Panelin açılış şeridi: `adet` rastgele ödül, `kazanan` sırada gerçek ödül durur. Şerit görsel içindir,
 * sonucu belirlemez; sonuç sunucuda önceden çekilmiştir.
 */
export function serit(kasa, odul, { adet = 44, kazanan = 38, rnd = randomInt } = {}) {
  return Array.from({ length: adet }, (_, i) => (i === kazanan ? odul : odulCek(kasa, rnd)))
}

/** Sahibin dağıtımının duyurusu (`.kasa dağıt` ve yönetim paneli). Ad düz yazılır, kimse etiketlenmez. */
export function kasaYagmuruMetni(dagitilan, adOf) {
  return [
    `🎁 *KASA YAĞMURU!* ${dagitilan.length} kişiye birer kasa düştü:`,
    '',
    ...dagitilan.map((d) => `${kasaBul(d.tier).ad.split(' ')[0]} ${adOf(d.jid)} — ${kasaBul(d.tier).ad.replace(/^\S+\s/, '')}`),
    '',
    'Açmak için `.kasa aç <tier>` (anahtar gerekir).',
  ].join('\n')
}

/** Açılan ödülün tek satırlık anlatımı (WhatsApp ve panel). `sonuc` sandikAc'ın yazdığıdır. */
export function odulMetni(odul, sonuc = {}) {
  const renk = RENKLER[odul.renk]
  if (sonuc.nft) return `${renk.emoji} 🖼️ NFT: *${sonuc.nft.ad}* (#${sonuc.nft.no})`
  if (sonuc.kart) return `${renk.emoji} 🃏 Kart: *${sonuc.kart.ad}*`
  if (sonuc.unvan) return `${renk.emoji} 🏷️ Unvan: *${sonuc.unvan}*`
  if (odul.tur === 'coin') return `${renk.emoji} 🪙 *${odul.adet} coin*`
  // NFT'ler satılmış ya da unvan zaten var: yedek coin.
  return `${renk.emoji} ${odul.etiket} → yerine 🪙 *${sonuc.coin ?? 0} coin*`
}

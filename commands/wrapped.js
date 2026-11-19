import { requireGroup } from '../lib/group.js'
import logger from '../lib/logger.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi } from '../lib/stats.js'
import { displayName, fetchAvatar, resolveTargets } from '../lib/target.js'
import { grupWrapped, kisiWrapped, OYUN_ADI } from '../lib/wrapped.js'
import { wrappedKarti } from '../lib/wrappedKart.js'

const GRUP_ADLARI = new Set(['grup', 'group', 'herkes'])

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

/** '2026-08-16' → '16 Ağu 2026' */
export function tarihYaz(gun) {
  if (!gun) return '?'
  const [y, a, g] = gun.split('-').map(Number)
  return `${g} ${AYLAR[a - 1]} ${y}`
}

const BIRIMLER = [[1e15, 'katrilyon'], [1e12, 'trilyon'], [1e9, 'milyar'], [1e6, 'milyon']]

/** Kartta uzun rakam taşmasın: 1234567 → '1,2 milyon'. Milyonun altı binlik yazılır. */
export function kisaSayi(n) {
  const mutlak = Math.abs(n)
  for (const [esik, ad] of BIRIMLER) {
    if (mutlak >= esik) return `${(n / esik).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${ad}`
  }
  return binlik(n)
}

const isaretli = (n) => `${n > 0 ? '+' : ''}${kisaSayi(n)}`
const saatYaz = (s) => (s === null ? '—' : `${String(s).padStart(2, '0')}:00`)
const yuzde = (oran) => `%${(oran * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
const oyunAdi = (kod) => OYUN_ADI[kod] ?? kod
const aralik = (ilk) => (ilk ? `${tarihYaz(ilk)} → bugün` : 'İlk kayıttan bugüne')
const DIP = 'Toplamlar botun ilk gününden, günlük veriler panel kaydından beri.'

function kisiKarti(v, ad) {
  const kutular = [
    { ikon: '🏅', etiket: 'Gruptaki sıran', deger: `${v.sira}. / ${v.uyeSayisi}`, alt: `mesajların ${yuzde(v.grupPayi)}'i senden` },
    { ikon: '🔥', etiket: 'En uzun seri', deger: `${v.seri} gün`, alt: 'art arda yazdığın' },
    { ikon: '📅', etiket: 'Aktif gün', deger: `${v.aktifGun} gün`, alt: v.toplamGun ? `${v.toplamGun} günün ${yuzde(v.aktifPay)}'i` : '' },
    { ikon: '⏰', etiket: 'En aktif saatin', deger: saatYaz(v.saat), alt: v.gecePayi ? `mesajların ${yuzde(v.gecePayi)}'i gece` : '' },
    ...(v.enYogun ? [{ ikon: '📈', etiket: 'En çok yazdığın gün', deger: `${binlik(v.enYogun.mesaj)} mesaj`, alt: tarihYaz(v.enYogun.gun) }] : []),
    { ikon: '😂', etiket: 'Sticker · Ses', deger: `${binlik(v.stickers)} · ${binlik(v.voices)}` },
  ]
  if (v.kumar.games) {
    kutular.push({ ikon: '🎰', etiket: 'Kumar', deger: `${binlik(v.kumar.games)} el`, alt: `net ${isaretli(v.kumar.net)} XP` })
    if (v.kumar.favori) kutular.push({ ikon: '🎲', etiket: 'Favori oyunun', deger: oyunAdi(v.kumar.favori.oyun), alt: `${binlik(v.kumar.favori.games)} el` })
    if (v.kumar.vurgun?.en_buyuk) kutular.push({ ikon: '💥', etiket: 'En büyük vurgunun', deger: `+${kisaSayi(v.kumar.vurgun.en_buyuk)} XP`, alt: oyunAdi(v.kumar.vurgun.oyun) })
  }
  if (v.zirve?.xp > 0) kutular.push({ ikon: '🏔️', etiket: 'Cüzdan zirven', deger: `${kisaSayi(v.zirve.xp)} XP`, alt: tarihYaz(v.zirve.gun) })
  if (v.sampiyon) kutular.push({ ikon: '🏆', etiket: 'Sezon şampiyonluğu', deger: `${v.sampiyon} kez` })
  if (v.devirZengini) kutular.push({ ikon: '⭐', etiket: 'Devir zengini', deger: `${v.devirZengini} kez` })
  if (v.es) kutular.push({ ikon: '💍', etiket: 'Evli', deger: displayName(v.es) })
  if (v.cete) kutular.push({ ikon: '🏴', etiket: 'Çete', deger: v.cete })

  return {
    ust: 'WRAPPED',
    baslik: ad,
    altBaslik: aralik(v.ilkGun),
    hero: { deger: binlik(v.messages), etiket: 'mesaj yazdın' },
    rozet: v.kisilik,
    kutular,
    alt: DIP,
  }
}

function grupKarti(g) {
  const kisi = displayName
  const kutular = [
    { ikon: '👥', etiket: 'Konuşan üye', deger: `${g.uyeSayisi} kişi` },
    { ikon: '📅', etiket: 'Aktif gün', deger: `${g.aktifGun} gün`, alt: g.toplamGun ? `${g.toplamGun} gündür kayıtta` : '' },
    ...(g.enYogun ? [{ ikon: '📈', etiket: 'En yoğun gün', deger: `${binlik(g.enYogun.mesaj)} mesaj`, alt: tarihYaz(g.enYogun.gun) }] : []),
    { ikon: '⏰', etiket: 'Grubun saati', deger: saatYaz(g.saat) },
    { ikon: '🥇', etiket: 'En çok yazanlar', deger: kisi(g.yazanlar[0].user_jid), alt: g.yazanlar.map((y, i) => `${i + 1}. ${kisi(y.user_jid)} · ${binlik(y.messages)}`).join('\n') },
    { ikon: '😂', etiket: 'Sticker · Ses', deger: `${binlik(g.sticker)} · ${binlik(g.ses)}` },
  ]
  if (g.stickerKrali?.stickers) kutular.push({ ikon: '🖼️', etiket: 'Sticker kralı', deger: kisi(g.stickerKrali.user_jid), alt: `${binlik(g.stickerKrali.stickers)} sticker` })
  if (g.sesKrali?.voices) kutular.push({ ikon: '🎙️', etiket: 'Podcast\'çi', deger: kisi(g.sesKrali.user_jid), alt: `${binlik(g.sesKrali.voices)} ses` })
  if (g.geceKusu) kutular.push({ ikon: '🦉', etiket: 'Gece kuşu', deger: kisi(g.geceKusu.user_jid), alt: `00-04 arası ${binlik(g.geceKusu.mesaj)} mesaj` })
  if (g.kumarEl) kutular.push({ ikon: '🎰', etiket: 'Kumar', deger: `${binlik(g.kumarEl)} el`, alt: g.favoriOyun ? `favori: ${oyunAdi(g.favoriOyun.oyun)}` : '' })
  if (g.kumarKrali) kutular.push({ ikon: '🤑', etiket: 'Kumarın kralı', deger: kisi(g.kumarKrali.user_jid), alt: `net ${isaretli(g.kumarKrali.net)} XP` })
  if (g.kumarKurbani) kutular.push({ ikon: '🪦', etiket: 'Kumarın kurbanı', deger: kisi(g.kumarKurbani.user_jid), alt: `net ${isaretli(g.kumarKurbani.net)} XP` })
  if (g.vurgun?.en_buyuk) kutular.push({ ikon: '💥', etiket: 'En büyük vurgun', deger: `+${kisaSayi(g.vurgun.en_buyuk)} XP`, alt: `${kisi(g.vurgun.user_jid)} · ${oyunAdi(g.vurgun.oyun)}` })
  if (g.zirve?.xp > 0) kutular.push({ ikon: '🏔️', etiket: 'Cüzdan rekoru', deger: `${kisaSayi(g.zirve.xp)} XP`, alt: `${kisi(g.zirve.user_jid)} · ${tarihYaz(g.zirve.gun)}` })
  if (g.sampiyon) kutular.push({ ikon: '🏆', etiket: 'En çok şampiyon', deger: kisi(g.sampiyon.user_jid), alt: `${g.sampiyon.kez} sezon` })
  if (g.reborn || g.evlilik) kutular.push({ ikon: '♻️', etiket: 'Reborn · Evlilik', deger: `${g.reborn} · ${g.evlilik}` })

  return {
    ust: 'GRUP WRAPPED',
    baslik: g.ad || 'Grubumuz',
    altBaslik: aralik(g.ilkGun),
    hero: { deger: binlik(g.mesaj), etiket: 'mesaj yazıldı' },
    rozet: null,
    kutular,
    alt: DIP,
  }
}

export default {
  name: 'wrapped',
  aliases: ['yılözeti', 'yilozeti'],
  description: 'İlk kayıttan bugüne kişisel ya da grup özeti, görsel kart olarak',
  usage: '.wrapped  —  .wrapped @kişi  —  .wrapped grup',
  details: [
    '`.wrapped` kendi kartın, `.wrapped @kişi` başkasınınki, `.wrapped grup` grubun.',
    'Toplam mesaj, sticker, ses ve saat dağılımı botun ilk gününden; seri, en yoğun gün ve cüzdan zirvesi panel kaydından beri sayılır.',
    'Reborn\'da silinen tablolar (banka, coin, vergi) kartta yoktur.',
  ],
  category: 'istatistik',
  cooldown: 60,
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed, isOwner }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      let kart
      let avatarJid
      if (GRUP_ADLARI.has((args[0] || '').toLocaleLowerCase('tr'))) {
        const g = grupWrapped(from)
        if (!g) return await yaz('🎁 Bu grubun henüz özeti çıkacak kadar kaydı yok.')
        kart = grupKarti(g)
        avatarJid = from
      } else {
        const [jid] = resolveTargets(parsed, { args, limit: 1, includeSender: true })
        if (botHesabiMi(jid) && !isOwner) return await yaz('🤖 Botun hesabı gizli.')

        const v = kisiWrapped(from, jid)
        if (!v) return await yaz('🎁 Bu kişinin henüz kaydı yok.')
        kart = kisiKarti(v, jid === parsed.sender && parsed.pushName ? parsed.pushName : displayName(jid))
        avatarJid = jid
      }

      const gorsel = await wrappedKarti({ ...kart, seed: avatarJid, avatar: await fetchAvatar(sock, avatarJid) })
      await sock.sendMessage(from, { image: gorsel, caption: `🎁 *${kart.ust}* · ${kart.baslik}` }, { quoted: msg })
    } catch (err) {
      logger.error({ err, from }, '.wrapped başarısız')
      await yaz('🎁 Özet hazırlanamadı, sonra dene.').catch((e) =>
        logger.error({ err: e }, '.wrapped hata mesajı gönderilemedi'),
      )
    }
  },
}

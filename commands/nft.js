import { ambargoMesaji } from '../lib/devlet.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { BIRIM, sulyCoz, sulyYaz } from '../lib/kripto.js'
import { NADIRLIK, NFT_GERI_ALIM, NFT_KOMISYON, nftBul, NFTLER } from '../lib/nft.js'
import { nftGalerisi, nftKarti } from '../lib/nftResim.js'
import { binlik } from '../lib/sayi.js'
import { botGonderisi } from '../lib/sosyal.js'
import { botHesabiMi, nftAl, nftBoz, nftIlan, nftListesi, nftVer, sulyMarketKati } from '../lib/stats.js'
import { katliFiyat } from '../lib/sulymarket.js'
import { displayName, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KAPALI = '🖼️ Galeri şu an kapalı, sonra dene.'
const SENIN_DEGIL = '🖼️ Bu NFT senin değil.'
const BORCLU = '💳 Kredi borcun ya da eksi cüzdanın varken NFT alıp veremezsin.'

/** `.nft sat 7 0.5` → "0.5". Ham metinden okunur: handler "0.001"i binlik sanıp 1 yapardı. */
export const fiyatMetni = (text) => String(text || '').trim().split(/\s+/)[2] ?? ''

function sinifSatiri(sinif, satilan, kat) {
  const hepsi = NFTLER.filter((n) => n.sinif === sinif)
  const bos = hepsi.filter((n) => !satilan.has(n.no)).length
  return `${NADIRLIK[sinif].ad} — ${binlik(katliFiyat(NADIRLIK[sinif].fiyat, kat))} Suly  (${bos}/${hepsi.length} sahipsiz)`
}

async function galeri({ sock, msg, from, sender }) {
  const liste = nftListesi(from)
  const kat = sulyMarketKati({ chatJid: from })
  const satilan = new Set(liste.map((r) => r.no))
  const benim = liste.filter((r) => r.user_jid === sender)
  const ilanlar = liste.filter((r) => r.fiyat)

  const caption = [
    '🖼️ *Suly Mahlukatı*  —  her birinden dünyada tek tane',
    '',
    ...Object.keys(NADIRLIK).map((s) => sinifSatiri(s, satilan, kat)),
    ...(ilanlar.length
      ? ['', '*Satılık*', ...ilanlar.map((r) => `#${r.no} ${nftBul(r.no)?.ad} — ${sulyYaz(r.fiyat)} Suly (${displayName(r.user_jid)})`)]
      : []),
    ...(benim.length ? ['', `*Seninkiler*: ${benim.map((r) => `#${r.no} ${nftBul(r.no)?.ad}`).join(', ')}`] : []),
    '',
    '`.nft 7` göster  •  `.nft al 7`  •  `.nft sat 7 12,5`  •  `.nft iptal 7`  •  `.nft ver @kişi 7`  •  `.nft boz 7`',
  ].join('\n')
  await sock.sendMessage(from, { image: await nftGalerisi(satilan), caption }, { quoted: msg })
}

async function goster({ sock, msg, from, nft }) {
  const satir = nftListesi(from).find((r) => r.no === nft.no)
  const durum = !satir
    ? `Sahipsiz, ${binlik(katliFiyat(nft.fiyat, sulyMarketKati({ chatJid: from })))} Suly: \`.nft al ${nft.no}\``
    : `Sahibi: ${displayName(satir.user_jid)}${satir.fiyat ? `\nSatılık: ${sulyYaz(satir.fiyat)} Suly, \`.nft al ${nft.no}\`` : ''}`
  await sock.sendMessage(from, {
    image: await nftKarti(nft),
    caption: `🖼️ *${nft.ad}* #${nft.no}  ${NADIRLIK[nft.sinif].ad}\n${durum}`,
  }, { quoted: msg })
}

async function al({ sock, msg, from, sender, nft, yaz }) {
  const s = nftAl({ chatJid: from, userJid: sender, no: nft.no })
  if (!s) return yaz(KAPALI)
  if (s.senin) return yaz('🖼️ Bu zaten senin.')
  if (s.satilikDegil) return yaz(`🖼️ ${displayName(s.satilikDegil)} bunu satmıyor.`)
  if (s.borclu) return yaz(BORCLU)
  if (s.ambargo) return yaz(ambargoMesaji(s.ambargo))
  if (s.saticiEngelli) return yaz('🖼️ Satıcı borçlu ya da ambargoda, satış yapılamıyor.')
  if (s.yetersiz) return yaz(`🖼️ ${sulyYaz(s.fiyat)} Suly gerekiyor, sende ${sulyYaz(s.birim)} var.`)

  if (nft.sinif !== 'siradan') botGonderisi(from, `🖼️ ${displayName(sender)}, ${nft.ad} (#${nft.no}) NFT'sini ${sulyYaz(s.fiyat)} Suly'ye aldı.`)
  await sock.sendMessage(from, {
    image: await nftKarti(nft),
    caption: `🖼️ *${nft.ad}* #${nft.no} artık senin!\n💸 ${sulyYaz(s.fiyat)} Suly${s.satici ? ` (${displayName(s.satici)} sattı)` : ''}  •  🟠 Kalan: ${sulyYaz(s.birim)}`,
  }, { quoted: msg })
}

export default {
  name: 'nft',
  aliases: ['mahluk'],
  description: 'Suly ile tekil piksel NFT al, sat, koleksiyon yap',
  usage: '.nft  —  .nft <no>  —  .nft al <no>  —  .nft sat <no> <suly>  —  .nft iptal <no>  —  .nft ver @kişi <no>  —  .nft boz <no>',
  details: [
    `${NFTLER.length} mahluk var, grupta her birinin tek sahibi olur. Sahipsiz olan liste fiyatından alınır, ödenen Suly yanar.`,
    `\`.nft sat 7 12,5\` ilana koyar; alan olursa Suly sana geçer, %${NFT_KOMISYON} komisyon yanar. Fiyatı sen belirlersin.`,
    `\`.nft boz 7\` market liste fiyatının %${NFT_GERI_ALIM}'sine geri alır, mahluk yeniden satışa çıkar.`,
    'Kara şapka hacker NFT de çalabilir. Borçlu ya da ambargolu kişi üyelerle NFT alıp veremez.',
  ],
  category: 'ekonomi',
  cooldown: 8,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, text, parsed }) {
    const yaz = (metin) => sock.sendMessage(from, { text: metin }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const islem = trLower(args[0] || '')
      if (!islem) return await galeri({ sock, msg, from, sender })

      const dogrudan = /^#?\d+$/.test(islem) ? nftBul(islem.replace('#', '')) : null
      if (dogrudan) return await goster({ sock, msg, from, nft: dogrudan })

      // Numara kısa sayıdır: etiket yerine elle yazılmış telefon numara sanılmasın.
      const noHam = args.slice(1).find((a) => /^#?\d{1,3}$/.test(a))
      const nft = noHam ? nftBul(noHam.replace('#', '')) : null
      if (!nft) return await yaz(`🖼️ Numara yaz (1-${NFTLER.length}): \`.nft al 7\``)
      const ortak = { chatJid: from, userJid: sender, no: nft.no }

      if (islem === 'al') return await al({ sock, msg, from, sender, nft, yaz })

      if (islem === 'sat' || islem === 'iptal') {
        const fiyat = islem === 'iptal' ? 0 : sulyCoz(fiyatMetni(text))
        if (fiyat === null) return await yaz('🖼️ Fiyat yaz: `.nft sat 7 12,5`')
        const s = nftIlan({ ...ortak, fiyat })
        if (!s) return await yaz(KAPALI)
        if (s.senDegil) return await yaz(SENIN_DEGIL)
        if (s.borclu) return await yaz(BORCLU)
        if (s.ambargo) return await yaz(ambargoMesaji(s.ambargo))
        return await yaz(fiyat ? `🏷️ *${nft.ad}* ${sulyYaz(fiyat)} Suly'ye satılık. Alan: \`.nft al ${nft.no}\`` : '🏷️ İlan kaldırıldı.')
      }

      if (islem === 'ver') {
        const [hedefHam] = resolveTargets(parsed)
        const hedef = hedefHam && uyeKimligiBul(metadata, hedefHam)
        if (!hedef || hedef === sender) return await yaz('Kullanım: `.nft ver @kişi 7`')
        if (botHesabiMi(hedef)) return await yaz('🤖 Bota NFT verilmez.')
        const s = nftVer({ ...ortak, hedef })
        if (!s) return await yaz(KAPALI)
        if (s.senDegil) return await yaz(SENIN_DEGIL)
        if (s.borclu) return await yaz(BORCLU)
        if (s.ambargo) return await yaz(ambargoMesaji(s.ambargo))
        return await yaz(`🎁 *${nft.ad}* #${nft.no} ${displayName(hedef)} kişisine geçti.`)
      }

      if (islem === 'boz') {
        const s = nftBoz(ortak)
        if (!s) return await yaz(KAPALI)
        if (s.senDegil) return await yaz(SENIN_DEGIL)
        return await yaz(`♻️ *${nft.ad}* markete döndü: +${sulyYaz(s.odeme)} Suly\n🟠 Suly: ${sulyYaz(s.birim)}`)
      }

      await yaz(`🖼️ Fiyatlar: ${Object.values(NADIRLIK).map((n) => `${n.ad} ${sulyYaz(n.fiyat * BIRIM)}`).join(', ')}\nKullanım: \`.nft\``)
    } catch (err) {
      logger.error({ err, from }, '.nft başarısız')
      await yaz('🖼️ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.nft hata mesajı gönderilemedi'))
    }
  },
}

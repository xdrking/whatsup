import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { sureYaz } from './cark.js'
import { uyelikleriBul } from './panel.js'
import { grupIdCoz, numaraCoz } from './xpver.js'
import { digerUyeler, groupMetadata, uyeKimligiBul } from '../lib/group.js'
import { HAPIS_SAATI } from '../lib/hapis.js'
import { MULKLER } from '../lib/mulk.js'
import { isMuted } from '../lib/mute.js'
import { nftBul } from '../lib/nft.js'
import { binlik } from '../lib/sayi.js'
import { botGonderisi } from '../lib/sosyal.js'
import { botHesabiMi, hackerlarim, hackYap } from '../lib/stats.js'
import { HACK_GUNLUK, HACK_KORUNMA_MS, hackerBul, urunKoduyla } from '../lib/sulymarket.js'
import { displayName, mentionOf } from '../lib/target.js'
import { randomInt } from 'node:crypto'
import logger from '../lib/logger.js'

const KULLANIM = 'Kullanım (bota özelden): `.hack <numara ya da id> [çaylak|usta|kara]`'

/** Numara ya da kimlik; `.id` çıktısındaki "...@lid" kimliğinin yalnız rakamları da kabul edilir. */
function hedefBul(metadata, kimlik) {
  return uyeKimligiBul(metadata, kimlik) ?? (kimlik.includes('@') ? null : uyeKimligiBul(metadata, `${kimlik}@lid`))
}

function engelMetni({ engel, bitis }) {
  const kalan = bitis ? sureYaz(bitis - Date.now()) : ''
  return {
    'hacker-yok': '💻 Elinde öyle bir hacker yok. `.sulymarket`',
    bot: '🤖 Hazinenin güvenlik duvarı aşılamıyor.',
    kendin: '💻 Kendini hackleyemezsin.',
    hapis: `🚔 Hapishanede internet yok, ${kalan} kaldı.`,
    hak: `💻 Bugünlük ${HACK_GUNLUK} hack hakkın bitti.`,
    duvar: `🧱 Hedefin güvenlik duvarı var (${kalan}). Hacker harcanmadı.`,
    korunma: `🚨 Hedef yeni hacklendi, ${kalan} izleniyor. Hacker harcanmadı.`,
    bos: '💻 Hedefte çalacak bir şey yok. Hacker harcanmadı.',
  }[engel]
}

function ganimet(s) {
  return [
    ...(s.para ? [`💰 ${binlik(s.para)} XP`] : []),
    ...(s.coin ? [`🪙 ${binlik(s.coin)} coin`] : []),
    ...s.mulkler.map((m) => `${MULKLER.find((x) => x.kod === m.kod)?.ad ?? m.kod} x${m.adet}`),
    ...(s.nft ? [`🖼️ ${nftBul(s.nft).ad} (#${s.nft})`] : []),
  ].join('  •  ')
}

/** Kurban ve grup olanı öğrensin; susturulmuş gruba yazılmaz. Başarıda saldırgan hiç yazılmaz. */
async function duyur(sock, { chatJid, userJid }, kurban, s) {
  const metin = s.basarili
    ? `💻 *SİBER SALDIRI*\n${mentionOf(kurban)} hacklendi!\n${ganimet(s)}\n🕶️ Saldırganın kimliği bilinmiyor.`
    : s.gizli
      ? `🧑‍💻 ${mentionOf(kurban)} hesabına sızma girişimi püskürtüldü. Saldırgan VPN ardında kayboldu.`
      : `🚨 ${mentionOf(userJid)}, ${mentionOf(kurban)} hesabını hacklerken yakalandı!\n🚔 ${HAPIS_SAATI} saat hapis. Kefalet: ${binlik(s.hapis.kefalet)} XP (\`.kefalet\`)`
  if (s.basarili) botGonderisi(chatJid, `💻 ${displayName(kurban)} hacklendi. Saldırganın kimliği bilinmiyor.`)
  if (isMuted(chatJid)) return
  try {
    await sock.sendMessage(chatJid, { text: metin, mentions: s.basarili || s.gizli ? [kurban] : [userJid, kurban] })
  } catch (err) {
    logger.error({ err, chatJid }, '.hack duyurusu gönderilemedi')
  }
}

async function liste(sock, gruplar) {
  const satirlar = ['💻 *Hack terminali*', '']
  for (const { chatJid, userJid, hackerlar } of gruplar) {
    const metadata = await groupMetadata(sock, chatJid)
    satirlar.push(`*${metadata.subject || chatJid}*`, `🎒 ${hackerlar.map((h) => urunKoduyla(h.kod).ad).join(', ')}`)
    for (const jid of digerUyeler(metadata, userJid).filter((j) => !botHesabiMi(j))) {
      satirlar.push(`• ${displayName(jid)} — \`${jid.endsWith('@lid') ? jid : jid.split('@')[0]}\``)
    }
    satirlar.push('')
  }
  return [...satirlar, KULLANIM, 'Hacker yazmazsan elindeki en iyisi kullanılır.'].join('\n')
}

export default {
  name: 'hack',
  aliases: ['hackle'],
  description: 'Hacker\'la birinin parasına el koy (bota özelden)',
  usage: '.hack  —  .hack <numara ya da id> [çaylak|usta|kara] (bota özelden)',
  details: [
    'Önce `.sulymarket`\'ten hacker al. Bota *özelden* `.hack` yazınca hedeflerin kimlikleri listelenir.',
    '`.hack 905551234567 usta` — para doğrudan senin *bankana* geçer, coin ve mülkler senin olur. Kimliğin gizli kalır.',
    `Başarısız olursan yakalanır, ${HAPIS_SAATI} saat hapse girersin; VPN'in varsa yalnızca VPN yanar.`,
    `Günde ${HACK_GUNLUK} hack. Hacklenen kişi ${HACK_KORUNMA_MS / 3_600_000} saat korunur. Güvenlik duvarı hepsini durdurur.`,
  ],
  category: 'toplum',
  cooldown: 15,
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (parsed.isGroup) return await yaz('🤫 Grupta hack mi planlanır? Bota *özelden* yaz: `.hack`')

      const kimlikler = new Set([parsed.sender, parsed.senderPn].filter(Boolean).map((j) => jidNormalizedUser(j)))
      const { uyelikler } = await uyelikleriBul(sock, kimlikler)
      const gruplar = uyelikler
        .map((u) => ({ ...u, hackerlar: hackerlarim(u.chatJid, u.userJid) }))
        .filter((u) => u.hackerlar.length)
      if (!gruplar.length) return await yaz('💻 Elinde hacker yok. `.sulymarket`\'ten al.')

      if (!args.length) return await yaz(await liste(sock, gruplar))

      const hackerArg = args.find((a) => hackerBul(a))
      const grupArg = args.find((a) => a.endsWith('@g.us'))
      const kimlik = numaraCoz(args.filter((a) => a !== hackerArg && a !== grupArg).join(' '))
      if (!kimlik) return await yaz(KULLANIM)

      const adaylar = []
      for (const g of gruplar) {
        if (grupArg && g.chatJid !== grupIdCoz(grupArg)) continue
        const kurban = hedefBul(await groupMetadata(sock, g.chatJid), kimlik)
        if (kurban) adaylar.push({ ...g, kurban })
      }
      if (!adaylar.length) return await yaz('❌ Bu kimlik ortak grubunda bulunamadı. `.hack` yazınca hedefler listelenir.')
      if (adaylar.length > 1) return await yaz(`Hedefle birden çok ortak grubun var, sonuna grup id ekle:\n${adaylar.map((a) => `\`${a.chatJid}\``).join('\n')}`)

      const [a] = adaylar
      const hacker = hackerArg ? hackerBul(hackerArg) : a.hackerlar[0]
      const s = hackYap({
        chatJid: a.chatJid, hacker: a.userJid, kurban: a.kurban, kod: hacker.kod, sans: (yuzde) => randomInt(100) < yuzde,
      })
      if (!s) return await yaz('💻 Bağlantı koptu, sonra dene.')
      if (s.engel) return await yaz(engelMetni(s))

      const ad = displayName(a.kurban)
      await yaz(s.basarili
        ? [`✅ *SIZMA BAŞARILI* — ${ad}`, ganimet(s), `🏦 Bankan: ${binlik(s.banka)} XP`, '🕶️ Kimliğin gizli kaldı.'].join('\n')
        : s.gizli
          ? `❌ ${ad} hesabına sızılamadı. 🛰️ VPN seni sakladı (VPN harcandı).`
          : `🚨 Yakalandın! ${HAPIS_SAATI} saat hapis. Kefalet: ${binlik(s.hapis.kefalet)} XP`)
      await duyur(sock, a, a.kurban, s)
    } catch (err) {
      logger.error({ err, from }, '.hack başarısız')
      await yaz('💻 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.hack hata mesajı gönderilemedi'))
    }
  },
}

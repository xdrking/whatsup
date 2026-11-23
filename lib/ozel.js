// Özel sohbette yazılan komutların (.panel, .hack, .muhbir, maskeli .soygun) ortak yardımcıları:
// özel sohbet grubu söylemez, kişinin botla ortak gruplarından bulunur.
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { groupMetadata, uyeKimligiBul } from './group.js'
import { kimlikRakam } from './panelHesap.js'

/** Kişinin üye olduğu gruplar ve oradaki kimliği; numara ve LID de üye listesinden öğrenilir. */
export async function uyelikleriBul(sock, kimlikler) {
  const gruplar = await sock.groupFetchAllParticipating()
  const uyelikler = []
  let numara = ''
  let lid = ''
  for (const [chatJid, metadata] of Object.entries(gruplar)) {
    const uye = (metadata.participants || []).find((u) =>
      [u.id, u.jid, u.lid].some((j) => j && kimlikler.has(jidNormalizedUser(j))),
    )
    if (!uye) continue
    uyelikler.push({ chatJid, userJid: jidNormalizedUser(uye.id) })
    for (const j of [uye.id, uye.jid, uye.lid].filter(Boolean).map((x) => jidNormalizedUser(x))) {
      if (j.endsWith('@s.whatsapp.net')) numara ||= kimlikRakam(j.split('@')[0])
      if (j.endsWith('@lid')) lid ||= kimlikRakam(j.split('@')[0])
    }
  }
  for (const j of kimlikler) {
    if (j.endsWith('@s.whatsapp.net')) numara ||= kimlikRakam(j.split('@')[0])
    if (j.endsWith('@lid')) lid ||= kimlikRakam(j.split('@')[0])
  }
  return { uyelikler, numara, lid }
}

/** Özelden yazanın botla ortak grupları. @returns {Promise<{ chatJid: string, userJid: string }[]>} */
export async function ozelUyelikler(sock, parsed) {
  const kimlikler = new Set([parsed.sender, parsed.senderPn].filter(Boolean).map((j) => jidNormalizedUser(j)))
  return (await uyelikleriBul(sock, kimlikler)).uyelikler
}

/** Numara ya da kimlik; `.id` çıktısındaki "...@lid" kimliğinin yalnız rakamları da kabul edilir. */
export function hedefBul(metadata, kimlik) {
  return uyeKimligiBul(metadata, kimlik) ?? (kimlik.includes('@') ? null : uyeKimligiBul(metadata, `${kimlik}@lid`))
}

/** Hedefin bulunduğu ortak gruplar. `grup` verilirse yalnızca o grup. */
export async function ozelHedefler(sock, uyelikler, kimlik, grup = null) {
  const adaylar = []
  for (const u of uyelikler) {
    if (grup && u.chatJid !== grup) continue
    const hedef = hedefBul(await groupMetadata(sock, u.chatJid), kimlik)
    if (hedef) adaylar.push({ ...u, hedef })
  }
  return adaylar
}

export const HEDEF_YOK = '❌ Bu kimlik ortak grubunda bulunamadı. `.hack` yazınca kimlikler listelenir.'
export const cokGrupMetni = (adaylar) => `Hedefle birden çok ortak grubun var, sonuna grup id ekle:\n${adaylar.map((a) => `\`${a.chatJid}\``).join('\n')}`

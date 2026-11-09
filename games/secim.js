// Seçim süresi dolunca sonucu gruba yazar. Asıl kapanış veritabanındadır (`secimleriKapat`):
// bot yeniden başlarsa zamanlayıcı ölür, sonuç bir sonraki `.seçim` okumasında açıklanır.
import { makamKoduyla } from '../lib/devlet.js'
import { isMuted } from '../lib/mute.js'
import { secimleriKapat } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

const kurulu = new Set()

async function duyur(sock, chatJid) {
  const kapananlar = secimleriKapat({ chatJid })
  if (!kapananlar?.length || isMuted(chatJid)) return

  const lines = ['🗳️ *SEÇİM SONUÇLANDI*', '']
  for (const k of kapananlar) {
    const ad = makamKoduyla(k.makam).ad
    lines.push(k.user_jid ? `🎉 ${ad}: ${mentionOf(k.user_jid)} (${k.oy} oy)` : `${ad}: oy çıkmadı, makam değişmedi.`)
  }
  await sock.sendMessage(chatJid, { text: lines.join('\n'), mentions: kapananlar.map((k) => k.user_jid).filter(Boolean) })
}

export function secimSonucunuZamanla({ sock, chatJid, makam, bitis }) {
  const anahtar = `${chatJid}|${makam}|${bitis}`
  if (kurulu.has(anahtar)) return
  kurulu.add(anahtar)

  const zamanlayici = setTimeout(() => {
    kurulu.delete(anahtar)
    duyur(sock, chatJid).catch((err) => logger.error({ err, chatJid }, 'Seçim sonucu gönderilemedi'))
  }, Math.max(0, bitis - Date.now()) + 1000)
  zamanlayici.unref?.()
}

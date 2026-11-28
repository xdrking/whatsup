// Bot tarafı: yönetim panelinin bıraktığı işleri (duyuru, kasa dağıtımı) birkaç saniyede bir işler ve nabız yazar.
// Panel WhatsApp'a bağlanmadığı için gruba mesajı bot atar. Duyuru bot sahibinin kararıyla "kendiliğinden mesaj"
// kuralının istisnasıdır; aynı gruba 10 dakikada birden sık atılmaz (lib/yonetim.js:isEkle).
import { groupMetadata } from './group.js'
import logger from './logger.js'
import { isMuted } from './mute.js'
import { kasaYagmuruMetni } from './sandik.js'
import { botHesabiniTani, sandikDagit } from './stats.js'
import { displayName } from './target.js'
import { isAl, isBitir, nabizYaz, yarimIsleriKapat } from './yonetim.js'

const TUR_MS = 5000

/** Duyuru metni. İmza "Yönetim"dir: kimin yazdığı grupta görünmez, kayıt defterinde durur. */
export const duyuruMetni = (metin) => `📢 *DUYURU*\n\n${metin}\n\n— _Yönetim_`

const ISLEYICILER = {
  async duyuru(sock, is) {
    const metin = String(is.veri.metin ?? '').trim()
    if (!metin) return 'Boş duyuru'
    let mentions = []
    if (is.veri.etiket) {
      const meta = await groupMetadata(sock, is.chat_jid)
      // Etiketler metne yazılmaz (gizli etiket): 50 kişilik @ listesi duyuruyu okunmaz yapardı, bildirim yine düşer.
      mentions = (meta.participants || []).map((u) => u.id)
    }
    await sock.sendMessage(is.chat_jid, { text: duyuruMetni(metin), mentions })
    return mentions.length ? `${mentions.length} kişi etiketlendi` : 'Etiketsiz gönderildi'
  },

  async kasa_dagit(sock, is) {
    const meta = await groupMetadata(sock, is.chat_jid)
    const dagitilan = sandikDagit({ chatJid: is.chat_jid, uyeler: (meta.participants || []).map((u) => u.id) })
    if (!dagitilan) throw new Error('Kasa deposu kapalı')
    await sock.sendMessage(is.chat_jid, { text: kasaYagmuruMetni(dagitilan, displayName) })
    return `${dagitilan.length} kişiye kasa verildi`
  },
}

export async function yonetimTuru(sock) {
  // Bağlantı yokken iş alınmaz (gönderim düşer, iş boşuna hata olurdu) ve nabız yazılmaz: panel botu çevrimdışı görür.
  if (!sock?.user) return
  nabizYaz()
  botHesabiniTani(sock.user)
  for (let is = isAl(); is; is = isAl()) {
    try {
      if (isMuted(is.chat_jid)) {
        isBitir(is.id, { tamam: false, sonuc: 'Grup .sus ile susturulmuş' })
        continue
      }
      const sonuc = await ISLEYICILER[is.tur](sock, is)
      isBitir(is.id, { tamam: true, sonuc })
      logger.info({ id: is.id, tur: is.tur, chat: is.chat_jid }, 'Yönetim işi yapıldı')
    } catch (err) {
      logger.error({ err, id: is.id, tur: is.tur }, 'Yönetim işi yapılamadı')
      isBitir(is.id, { tamam: false, sonuc: err?.message ?? 'Bilinmeyen hata' })
    }
  }
}

/** `index.js` bir kez çağırır; `sockAl` o anki soketi verir (yeniden bağlanınca soket değişir). */
export function yonetimDongusu(sockAl) {
  const kapanan = yarimIsleriKapat()
  if (kapanan) logger.warn({ kapanan }, 'Yarıda kalan yönetim işleri hata sayıldı')
  let calisiyor = false
  setInterval(() => {
    if (calisiyor) return
    calisiyor = true
    yonetimTuru(sockAl())
      .catch((err) => logger.error({ err }, 'Yönetim turu başarısız'))
      .finally(() => { calisiyor = false })
  }, TUR_MS)
}

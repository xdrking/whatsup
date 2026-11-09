import logger from '../lib/logger.js'
import { requireGroup } from '../lib/group.js'
import {
  AD_UZUNLUK, adTemizle, cubuk, HEDIYE_ESIGI, MAMA_FIYATI, MAMA_TOKLUK, ruhHali, seviye, TURLER, turBul,
} from '../lib/pet.js'
import { binlik } from '../lib/sayi.js'
import {
  petAdDegistir, petBesle, petBirak, petFiyati, petHediye, petOku, petOyna, petSahiplen, petSiralamasi,
} from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { katla } from '../games/kimim.js'

const SAAT_MS = 3_600_000

function sureYaz(ms) {
  const dk = Math.ceil(ms / 60_000)
  if (dk < 60) return `${dk} dk`
  const sa = Math.floor(dk / 60)
  return dk % 60 ? `${sa} sa ${dk % 60} dk` : `${sa} sa`
}

const petAdi = (pet) => `${TURLER[pet.tur].emoji} *${pet.ad}*`

function kart(pet, d, sahip, now) {
  const yas = Math.floor((now - pet.dogum) / (24 * SAAT_MS))
  return [
    `${petAdi(pet)} (${TURLER[pet.tur].ad})`,
    `👤 Sahibi: ${mentionOf(sahip)}`,
    `⭐ Seviye ${seviye(pet.pet_xp)}  •  Pet XP ${pet.pet_xp}`,
    `🍖 Tokluk   ${cubuk(d.tokluk)}`,
    `🎾 Mutluluk ${cubuk(d.mutluluk)}`,
    `Ruh hali: ${ruhHali(d)}`,
    `🎂 Yaşı: ${yas ? `${yas} gün` : 'yeni doğdu'}`,
  ].join('\n')
}

function turListesi(chatJid) {
  return Object.entries(TURLER)
    .map(([kod, t]) => `${t.emoji} ${t.ad} (\`${kod}\`): ${binlik(petFiyati(chatJid, t.fiyat))} XP${t.carpan !== 1 ? `  •  hediye x${String(t.carpan).replace(".", ",")}` : ''}`)
    .join('\n')
}

const seviyeSatiri = (once, pet) =>
  seviye(pet.pet_xp) > seviye(once) ? `\n🎉 *${pet.ad}* seviye atladı: ${seviye(pet.pet_xp)}!` : ''

export default {
  name: 'pet',
  aliases: ['hayvan', 'evcil'],
  description: 'Evcil hayvan sahiplen, besle, oyna, günlük hediyesini al',
  usage: '.pet  —  .pet sahiplen <tür> <ad>  —  .pet besle|oyna|hediye|top',
  details: [
    '`.pet sahiplen kedi Pamuk` hayvanı alır, ücret yanar. Kişi başı bir hayvan.',
    `\`.pet besle\` mama alır (tokluk +${MAMA_TOKLUK}, ${100 - MAMA_TOKLUK} üstündeyse tok), \`.pet oyna\` saatte bir mutluluk verir.`,
    `\`.pet hediye\` günde bir XP getirir. Tokluk ve mutluluk ${HEDIYE_ESIGI}'un altındaysa getirmez, seviye ve mutluluk arttıkça büyür.`,
    'Tokluk 25 saatte, mutluluk 33 saatte biter. 2 gün aç kalan hayvan kaçar!',
    '`.pet @kişi` başkasının hayvanı, `.pet ad <yeni ad>`, `.pet bırak onay`, `.pet top` sıralama.',
  ],
  category: 'ekonomi',
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })
    const now = Date.now()

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return
      const alt = katla(args[0] || '')
      const ortak = { chatJid: from, userJid: sender, now }

      // Ortak cevaplar: veritabanı yok, hayvan yok, hayvan kaçtı. true dönerse komut biter.
      const genel = async (s) => {
        if (!s) {
          await yaz('🐾 Şu an hayvan barınağı kapalı, sonra dene.')
          return true
        }
        if (s.kacti) {
          await yaz(`💔 ${petAdi(s.pet)} çok aç kaldığı için kaçtı... Yenisini \`.pet sahiplen\` ile alabilirsin.`)
          return true
        }
        if (s.yok) {
          await yaz(`🐾 Hayvanın yok. Sahiplen: \`.pet sahiplen <tür> <ad>\`\n\n${turListesi(from)}`)
          return true
        }
        return false
      }

      // Yanıtla yazılan `.pet besle` yanıtlanan kişinin kartını açmasın: hedef yalnızca alt komutsuzken aranır.
      if (!alt || alt.startsWith('@')) {
        const [hedef] = resolveTargets(parsed, { includeSender: true })
        const s = petOku({ chatJid: from, userJid: hedef, now })
        if (hedef !== sender && (s?.yok || s?.kacti)) return await yaz(`🐾 ${mentionOf(hedef)} kişisinin hayvanı yok.`, [hedef])
        if (await genel(s)) return
        return await yaz(kart(s.pet, s.durum, hedef, now), [hedef])
      }

      if (alt === 'sahiplen' || alt === 'al') {
        const tur = turBul(args[1])
        const ad = adTemizle(args.slice(2).join(' '))
        if (!tur || !ad) return await yaz(`Kullanım: \`.pet sahiplen <tür> <ad>\` (ad en çok ${AD_UZUNLUK} harf)\n\n${turListesi(from)}`)
        const s = petSahiplen({ ...ortak, tur, ad })
        if (!s) return await genel(s)
        if (s.kacti) return await yaz(`💔 Eski hayvanın ${s.pet.ad} kaçmış. Tekrar yaz, yenisini alalım.`)
        if (s.zatenVar) return await yaz(`Zaten ${petAdi(s.zatenVar)} var. Önce \`.pet bırak onay\`.`)
        if (s.yetersiz) return await yaz(`💸 ${TURLER[tur].ad} ${binlik(s.fiyat)} XP. XP'n: ${binlik(s.xp)}`)
        return await yaz(`🎉 ${petAdi(s.pet)} artık senin! -${binlik(s.fiyat)} XP\nBeslemeyi ve oynamayı unutma: \`.pet besle\`, \`.pet oyna\``)
      }

      if (alt === 'besle' || alt === 'mama') {
        const s = petBesle(ortak)
        if (await genel(s)) return
        if (s.tok) return await yaz(`😋 ${petAdi(s.pet)} tok (${Math.round(s.durum.tokluk)}). Sonra besle.`)
        if (s.yetersiz) return await yaz(`💸 Mama ${binlik(s.fiyat)} XP. XP'n: ${binlik(s.xp)}`)
        return await yaz(`🍖 ${petAdi(s.pet)} mamasını yedi! Tokluk ${Math.round(s.pet.tokluk)}  •  -${binlik(s.fiyat)} XP${seviyeSatiri(s.oncekiXp, s.pet)}`)
      }

      if (alt === 'oyna' || alt === 'sev') {
        const s = petOyna(ortak)
        if (await genel(s)) return
        if (s.bekle) return await yaz(`😴 ${petAdi(s.pet)} yoruldu, ${sureYaz(s.bekle)} sonra oyna.`)
        if (s.ac) return await yaz(`🥺 ${petAdi(s.pet)} çok aç, oynamak istemiyor. Önce \`.pet besle\`.`)
        return await yaz(`🎾 ${petAdi(s.pet)} ile oynadın! Mutluluk ${Math.round(s.pet.mutluluk)}${seviyeSatiri(s.oncekiXp, s.pet)}`)
      }

      if (alt === 'hediye') {
        const s = petHediye(ortak)
        if (await genel(s)) return
        if (s.bekle) return await yaz(`🎁 ${petAdi(s.pet)} bugünkü hediyesini getirdi. ${sureYaz(s.bekle)} sonra tekrar.`)
        if (s.isteksiz) return await yaz(`😿 ${petAdi(s.pet)} hediye aramaya gidecek halde değil. Tokluk ve mutluluk ${HEDIYE_ESIGI}'un üstünde olmalı.`)
        return await yaz(`🎁 ${petAdi(s.pet)} ağzında bir kese ile geldi: *+${binlik(s.xp)} XP*`)
      }

      if (alt === 'ad' || alt === 'isim') {
        const ad = adTemizle(args.slice(1).join(' '))
        if (!ad) return await yaz(`Kullanım: \`.pet ad <yeni ad>\` (en çok ${AD_UZUNLUK} harf)`)
        const s = petAdDegistir({ ...ortak, ad })
        if (await genel(s)) return
        return await yaz(`✏️ ${s.eski} artık ${petAdi(s.pet)}.`)
      }

      if (alt === 'birak' || alt === 'sal') {
        if (katla(args[1] || '') !== 'onay') {
          return await yaz('⚠️ Hayvanın gider, ücreti geri gelmez. Emin isen `.pet bırak onay`.')
        }
        const s = petBirak(ortak)
        if (await genel(s)) return
        return await yaz(`👋 ${petAdi(s.pet)} barınağa bırakıldı.`)
      }

      if (alt === 'top' || alt === 'sira') {
        const liste = petSiralamasi(from)
        if (!liste.length) return await yaz('🐾 Bu grupta henüz evcil hayvan yok.')
        return await yaz(
          ['🏆 *En iyi evcil hayvanlar*', '', ...liste.map((p, i) =>
            `${i + 1}. ${petAdi(p)}  •  Sv ${seviye(p.pet_xp)}  •  ${mentionOf(p.user_jid)}`)].join('\n'),
          liste.map((p) => p.user_jid),
        )
      }

      if (alt === 'fiyat' || alt === 'barinak') {
        return await yaz(`🐾 *Barınak*\n\n${turListesi(from)}\n\n🍖 Mama: ${binlik(petFiyati(from, MAMA_FIYATI))} XP`)
      }

      await yaz('Kullanım: `.pet`, `.pet sahiplen <tür> <ad>`, `.pet besle`, `.pet oyna`, `.pet hediye`, `.pet top`')
    } catch (err) {
      logger.error({ err, from }, '.pet başarısız')
      await yaz('🐾 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.pet hata mesajı gönderilemedi'))
    }
  },
}

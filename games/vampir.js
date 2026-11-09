import logger from '../lib/logger.js'
import { binlik } from '../lib/sayi.js'
import { oyunOdulu, oyunTutari } from '../lib/stats.js'
import { displayName, mentionOf } from '../lib/target.js'
import {
  gunduzKarari, geceSonucu, kazanan, MAX_OYUNCU, MIN_OYUNCU, oySay, rolAdi, rolDagit, rolSayilari, takimi,
} from '../lib/vampir.js'
import { endGame, getGame, setLastMessage, startGame, touchGame } from './gameManager.js'
import { katla } from './kimim.js'

const LOBI_MS = 2 * 60_000
const GECE_MS = 120_000
const GUNDUZ_MS = 3 * 60_000
// Fazlar kendi zamanlayıcısıyla ilerler. Bu yalnızca bir faz takılırsa oyun yuvası kilitli kalmasın diye.
const GUVENLIK_MS = 10 * 60_000
// Vampirler az ve yalnız olduğu için kazanmaları zordur, ödülleri büyüktür.
const XP_KOY = 50
const XP_VAMPIR = 80

// Gece eylemleri özelden komutla gelir, sohbet JID'i grubu söylemez: oyuncunun oyunu buradan bulunur.
const aktifOyunlar = new Set()

const oyunda = (state) => getGame(state.chatJid) === state && !state.finished
const canlilar = (state) => state.oyuncular.filter((o) => o.canli)

function temizle(state) {
  state.finished = true
  clearTimeout(state.fazTimer)
  aktifOyunlar.delete(state)
}

/** Fazın kendi süresi. Faz bu arada değiştiyse geç kalan zamanlayıcı hiçbir şey yapmaz. */
function fazZamanla(state, ms, faz, fn) {
  clearTimeout(state.fazTimer)
  state.fazTimer = setTimeout(() => {
    if (!oyunda(state)) return temizle(state)
    if (state.faz !== faz) return
    fn().catch((err) => logger.error({ err, chatJid: state.chatJid, faz }, 'Vampir fazı ilerletilemedi'))
  }, ms)
  state.fazTimer.unref?.()
  touchGame(state.chatJid)
}

// Grupta LID, özelde numara gelebilir: ikisine de bakılır.
function oyuncuBul(state, parsed) {
  const kimlikler = [parsed.sender, parsed.senderPn].filter(Boolean)
  return state.oyuncular.find((o) => kimlikler.includes(o.jid) || kimlikler.includes(o.pn)) || null
}

const grupListesi = (oyuncular) => oyuncular.map((o) => `${o.no}. ${mentionOf(o.jid)}`).join('\n')

function ozelListe(state, ben) {
  return canlilar(state)
    .map((o) => {
      const isaret = o === ben ? ' (sen)' : ben.rol === 'vampir' && o.rol === 'vampir' ? ' 🧛' : ''
      return `${o.no}. ${displayName(o.jid)}${isaret}`
    })
    .join('\n')
}

function rolMetni(state, o) {
  const satirlar = [`🎭 Rolün: *${rolAdi(o.rol)}*`, '']
  if (o.rol === 'vampir') {
    const takim = state.oyuncular.filter((x) => x.rol === 'vampir' && x !== o).map((x) => displayName(x.jid))
    if (takim.length) satirlar.push(`🧛 Takım arkadaşların: ${takim.join(', ')}`)
    satirlar.push('Her gece bana özelden `.vampir öldür <no>` yaz. Gündüz kimseye belli etme.')
  } else if (o.rol === 'doktor') {
    satirlar.push('Her gece bana özelden `.vampir koru <no>` yaz. Kendini de koruyabilirsin, aynı kişiyi iki gece üst üste koruyamazsın.')
  } else if (o.rol === 'kahin') {
    satirlar.push('Her gece bana özelden `.vampir bak <no>` yaz, o kişi vampir mi söylerim.')
  } else {
    satirlar.push('Gece bir şey yapmazsın. Gündüz oylamada vampirleri bul.')
  }
  satirlar.push('', 'Gece komutları yalnızca burada çalışır, grupta yazarsan rolün ortaya çıkar.')
  return satirlar.join('\n')
}

function rolDokumu(state) {
  return state.oyuncular
    .map((o) => `${o.canli ? '' : '💀 '}${mentionOf(o.jid)}: ${rolAdi(o.rol)}`)
    .join('\n')
}

async function grubaYaz(state, text, { son = false } = {}) {
  const mentions = state.oyuncular.map((o) => o.jid)
  const result = await state.sock.sendMessage(state.chatJid, { text, mentions })
  if (son) {
    const id = result?.key?.id
    if (!id) throw new Error('Vampir oyun mesajının id\'si alınamadı')
    setLastMessage(state.chatJid, id)
  }
  return result
}

async function oyunBitir(state, takim, giris) {
  temizle(state)
  endGame(state.chatJid)

  const tutar = takim === 'vampir' ? XP_VAMPIR : XP_KOY
  const odul = state.oyuncular
    .filter((o) => takimi(o.rol) === takim)
    .map((o) => `⭐ ${mentionOf(o.jid)} +${binlik(oyunOdulu({ chatJid: state.chatJid, userJid: o.jid, amount: tutar }))} XP`)

  await grubaYaz(state, [
    giris, '',
    takim === 'vampir' ? '🧛 *VAMPİRLER KAZANDI!* Köy düştü.' : '🏘️ *KÖY KAZANDI!* Bütün vampirler öldü.',
    '', '🎭 *Roller*', rolDokumu(state), '', ...odul,
  ].join('\n'))
}

/** Faz sonunda kazanan varsa oyunu bitirir. */
async function kazananVarsa(state, giris) {
  const takim = kazanan(state.oyuncular)
  if (!takim) return false
  await oyunBitir(state, takim, giris)
  return true
}

async function geceBaslat(state, giris = '') {
  state.gece += 1
  state.faz = 'gece'
  state.vampirOylari = new Map()
  state.korunan = null
  state.doktorEtti = false
  state.bakti = false

  await grubaYaz(state, [
    ...(giris ? [giris, ''] : []),
    `🌙 *GECE ${state.gece}*`, '',
    'Köy uyuyor. Gece rolleri bana özelden yazsın.',
    `⏱️ ${GECE_MS / 1000} sn`, '',
    grupListesi(canlilar(state)),
  ].join('\n'), { son: true })
  if (!oyunda(state)) return

  for (const o of canlilar(state).filter((x) => x.rol !== 'koylu')) {
    try {
      await state.sock.sendMessage(o.pn, { text: [`🌙 *Gece ${state.gece}*`, '', ozelListe(state, o)].join('\n') })
    } catch (err) {
      logger.error({ err, chatJid: state.chatJid }, 'Vampir gece listesi özelden gönderilemedi')
    }
  }
  // Listeler giderken herkes eylemini yapmış olabilir: gece o zaman zaten kapanmıştır.
  if (!oyunda(state) || state.faz !== 'gece') return
  fazZamanla(state, GECE_MS, 'gece', () => geceBitir(state))
}

function geceTamam(state) {
  const canli = canlilar(state)
  return canli.filter((o) => o.rol === 'vampir').every((v) => state.vampirOylari.has(v.no))
    && (!canli.some((o) => o.rol === 'doktor') || state.doktorEtti)
    && (!canli.some((o) => o.rol === 'kahin') || state.bakti)
}

async function geceBitir(state) {
  if (state.faz !== 'gece') return
  state.faz = 'gecis'

  const sonuc = geceSonucu({ vampirOylari: state.vampirOylari, korunan: state.korunan })
  state.sonKorunan = state.korunan

  let giris
  if (sonuc.hedef) {
    const olen = state.oyuncular.find((o) => o.no === sonuc.hedef)
    olen.canli = false
    giris = `☀️ Sabah oldu. ${mentionOf(olen.jid)} gece ısırılarak öldü. Rolü: *${rolAdi(olen.rol)}*`
  } else if (sonuc.kurtarildi) {
    giris = '☀️ Sabah oldu. Vampirler saldırdı ama 🩺 doktor kurbanı kurtardı!'
  } else {
    giris = '☀️ Sabah oldu. Sessiz bir geceydi, kimse ölmedi.'
  }

  if (await kazananVarsa(state, giris)) return
  await gunduzBaslat(state, giris)
}

async function gunduzBaslat(state, giris) {
  state.faz = 'gunduz'
  state.oylar = new Map()

  await grubaYaz(state, [
    giris, '',
    `🗳️ *GÜNDÜZ ${state.gece} OYLAMASI*`, '',
    'Vampir sandığın kişinin numarasını *bu mesaja yanıt olarak* yaz. Kimseyi asmamak için `pas`.',
    `Oyunu değiştirebilirsin. ⏱️ ${GUNDUZ_MS / 60_000} dk`, '',
    grupListesi(canlilar(state)),
  ].join('\n'), { son: true })
  if (!oyunda(state) || state.faz !== 'gunduz') return
  fazZamanla(state, GUNDUZ_MS, 'gunduz', () => gunduzBitir(state))
}

async function gunduzBitir(state) {
  if (state.faz !== 'gunduz') return
  state.faz = 'gecis'

  const sayim = [...oySay(state.oylar)]
    .sort((a, b) => b[1] - a[1])
    .map(([no, s]) => `${displayName(state.oyuncular.find((o) => o.no === no).jid)}: ${s}`)
    .join(', ')
  const karar = gunduzKarari(state.oylar)

  let giris
  if (karar) {
    const asilan = state.oyuncular.find((o) => o.no === karar)
    asilan.canli = false
    giris = `⚖️ Köy ${mentionOf(asilan.jid)} kişisini astı. Rolü: *${rolAdi(asilan.rol)}*`
  } else {
    giris = '⚖️ Köy karar veremedi, kimse asılmadı.'
  }
  if (sayim) giris += `\n📊 ${sayim}`

  if (await kazananVarsa(state, giris)) return
  await geceBaslat(state, giris)
}

async function lobiBitir(state) {
  if (state.faz !== 'lobi') return
  state.faz = 'gecis'
  const { sock, chatJid } = state

  if (state.oyuncular.length < MIN_OYUNCU) {
    temizle(state)
    endGame(chatJid)
    await sock.sendMessage(chatJid, { text: `🧛 Yeterli oyuncu toplanmadı (en az ${MIN_OYUNCU}), oyun iptal.` })
    return
  }

  const roller = rolDagit(state.oyuncular.length)
  state.oyuncular.forEach((o, i) => Object.assign(o, { no: i + 1, rol: roller[i], canli: true }))

  const ulasmayan = []
  for (const o of state.oyuncular) {
    try {
      await sock.sendMessage(o.pn, { text: rolMetni(state, o) })
    } catch (err) {
      logger.error({ err, chatJid }, 'Vampir rolü özelden gönderilemedi')
      ulasmayan.push(o)
    }
  }
  if (!oyunda(state)) return

  if (ulasmayan.length) {
    temizle(state)
    endGame(chatJid)
    await sock.sendMessage(chatJid, {
      text: `❌ Şu kişilere özelden yazamadım: ${ulasmayan.map((o) => mentionOf(o.jid)).join(' ')}\nBota bir kez özelden yazıp tekrar deneyin.`,
      mentions: ulasmayan.map((o) => o.jid),
    })
    return
  }

  const s = rolSayilari(state.oyuncular.length)
  const dagilim = [`🧛 ${s.vampir} vampir`, s.doktor && '🩺 doktor', '🔮 kahin', `👨‍🌾 ${s.koylu} köylü`]
  await geceBaslat(state, [
    '🧛 *VAMPİR KÖYLÜ BAŞLADI*', '',
    `${state.oyuncular.length} oyuncu: ${dagilim.filter(Boolean).join(', ')}`,
    'Roller özelden gitti. Ölen kişinin rolü açıklanır.',
  ].join('\n'))
}

function lobiMetni(state) {
  return [
    '🧛 *VAMPİR KÖYLÜ*', '',
    `${mentionOf(state.starterJid)} bir köy kuruyor.`,
    '↩️ Katılmak için *bu mesaja* `katıl`, ayrılmak için `çık` yaz.',
    `Kuran \`başla\` yazınca ya da ${LOBI_MS / 60_000} dk dolunca oyun başlar (${MIN_OYUNCU}-${MAX_OYUNCU} kişi).`,
    `🏆 Kazanan köylüler +${binlik(oyunTutari(state.chatJid, XP_KOY))} XP, vampirler +${binlik(oyunTutari(state.chatJid, XP_VAMPIR))} XP`,
    '⚠️ Roller özelden gelir. Bota hiç özelden yazmamış olana ulaşamayabilirim.',
  ].join('\n')
}

async function lobiCevap({ sock, msg, parsed, state, body }) {
  const yaz = (text, mentions = []) => sock.sendMessage(state.chatJid, { text, mentions }, { quoted: msg })
  const k = katla(body)
  const ben = oyuncuBul(state, parsed)

  if (k === 'katil') {
    if (ben) return yaz('Zaten köydesin.')
    if (state.oyuncular.length >= MAX_OYUNCU) return yaz(`Köy dolu (${MAX_OYUNCU} kişi).`)
    state.oyuncular.push({ jid: parsed.sender, pn: parsed.senderPn || parsed.sender })
    return yaz(`✅ ${mentionOf(parsed.sender)} köye katıldı (${state.oyuncular.length} kişi).`, [parsed.sender])
  }
  if (k === 'cik') {
    if (!ben) return
    if (ben.jid === state.starterJid) return yaz('Köyü kuran çıkamaz, `.oyunbitir` ile kapatabilirsin.')
    state.oyuncular.splice(state.oyuncular.indexOf(ben), 1)
    return yaz(`👋 ${displayName(ben.jid)} köyden ayrıldı (${state.oyuncular.length} kişi).`)
  }
  if (k === 'basla') {
    if (parsed.sender !== state.starterJid) return yaz('Oyunu yalnızca köyü kuran başlatabilir.')
    if (state.oyuncular.length < MIN_OYUNCU) return yaz(`En az ${MIN_OYUNCU} kişi gerekiyor, şu an ${state.oyuncular.length}.`)
    return lobiBitir(state)
  }
  return yaz('`katıl`, `çık` ya da `başla` yaz.')
}

async function oyCevap({ sock, msg, parsed, state, body }) {
  const yaz = (text) => sock.sendMessage(state.chatJid, { text }, { quoted: msg })
  const ben = oyuncuBul(state, parsed)
  // Seyircinin yanıtı sohbettir, cevap verilmez.
  if (!ben) return
  if (!ben.canli) return yaz('💀 Ölüler oy veremez.')

  const k = katla(body)
  let hedef = null
  if (k !== 'pas') {
    const no = Number.parseInt(k, 10)
    hedef = canlilar(state).find((o) => o.no === no)
    if (!hedef) return yaz('Yaşayan bir oyuncunun numarasını ya da `pas` yaz.')
    if (hedef === ben) return yaz('Kendine oy veremezsin.')
  }

  state.oylar.set(ben.no, hedef?.no ?? null)
  const toplam = canlilar(state).length
  await yaz(`🗳️ ${displayName(ben.jid)} → ${hedef ? displayName(hedef.jid) : 'pas'} (${state.oylar.size}/${toplam})`)
  if (state.faz === 'gunduz' && state.oylar.size >= toplam) await gunduzBitir(state)
}

async function cevapAl(ctx) {
  const { state } = ctx
  if (!oyunda(state)) return
  if (state.faz === 'lobi') return lobiCevap(ctx)
  if (state.faz === 'gunduz') return oyCevap(ctx)
  if (state.faz === 'gece' && oyuncuBul(state, ctx.parsed)) {
    await ctx.sock.sendMessage(state.chatJid, { text: '🌙 Gece, köy uyuyor. Gece rolleri bana özelden yazar.' }, { quoted: ctx.msg })
  }
}

const EYLEMLER = {
  oldur: 'vampir', isir: 'vampir',
  koru: 'doktor',
  bak: 'kahin', kontrol: 'kahin',
}

/** Bu kelime bir gece eylemi mi? Komut grupta yazılınca uyarmak için. */
export const geceEylemiMi = (kelime) => Boolean(EYLEMLER[katla(kelime)])

/** Özelden gelen `.vampir öldür|koru|bak <no>`. */
export async function geceEylemi({ sock, msg, parsed, args }) {
  const yaz = (text) => sock.sendMessage(parsed.from, { text }, { quoted: msg })
  const gerekenRol = EYLEMLER[katla(args[0])]

  let state = null
  let ben = null
  for (const s of aktifOyunlar) {
    if (!oyunda(s)) {
      temizle(s)
      continue
    }
    const o = oyuncuBul(s, parsed)
    // İki grupta birden oynayan için gecesi süren oyun öne alınır.
    if (o && (!state || (s.faz === 'gece' && state.faz !== 'gece'))) {
      state = s
      ben = o
    }
  }

  if (!state) return yaz('Aktif bir vampir oyununda değilsin.')
  if (state.faz !== 'gece') return yaz('Şu an gece değil.')
  if (!ben.canli) return yaz('💀 Ölüler bir şey yapamaz.')
  if (ben.rol !== gerekenRol) return yaz(`Bu senin rolünün işi değil. Rolün: ${rolAdi(ben.rol)}`)

  const no = Number.parseInt(args[1], 10)
  const hedef = canlilar(state).find((o) => o.no === no)
  if (!hedef) return yaz(`Yaşayan bir oyuncunun numarasını yaz:\n\n${ozelListe(state, ben)}`)
  const ad = displayName(hedef.jid)

  if (ben.rol === 'vampir') {
    if (hedef.rol === 'vampir') return yaz('Kendi takımını ısıramazsın.')
    state.vampirOylari.set(ben.no, hedef.no)
    await yaz(`🩸 Hedefin: *${ad}*. Vampirler farklı seçerse kurban en çok seçilenlerden çekilir.`)
  } else if (ben.rol === 'doktor') {
    if (hedef.no === state.sonKorunan) return yaz('Aynı kişiyi iki gece üst üste koruyamazsın.')
    state.korunan = hedef.no
    state.doktorEtti = true
    await yaz(`🩺 Bu gece *${ad}* korunuyor.`)
  } else {
    if (state.bakti) return yaz('Bu gece zaten baktın.')
    state.bakti = true
    await yaz(hedef.rol === 'vampir' ? `🔮 *${ad}* bir VAMPİR! 🧛` : `🔮 *${ad}* vampir değil.`)
  }

  if (state.faz === 'gece' && oyunda(state) && geceTamam(state)) await geceBitir(state)
}

/** `.vampir` gövdesi. Çağıran grubu ve boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender, senderPn }) {
  const state = startGame(from, {
    type: 'vampir',
    starterJid: sender,
    sock,
    faz: 'lobi',
    gece: 0,
    oyuncular: [{ jid: sender, pn: senderPn || sender }],
    sonKorunan: null,
    lastMessageId: null,
    timeoutMs: GUVENLIK_MS,
    finished: false,
    fazTimer: null,
    onAnswer: cevapAl,
    summarize: (s) => {
      const basladi = s.oyuncular.every((o) => o.rol)
      temizle(s)
      return {
        text: ['🛑 Vampir oyunu durduruldu.', ...(basladi ? ['', '🎭 *Roller*', rolDokumu(s)] : [])].join('\n'),
        mentions: s.oyuncular.map((o) => o.jid),
      }
    },
    onTimeout: async () => {
      temizle(state)
      await sock.sendMessage(from, { text: '⏱️ Vampir oyunu uzun süre ilerlemedi, kapatıldı.' })
    },
  })
  if (!state) {
    await sock.sendMessage(from, { text: '⚠️ Bu grupta zaten aktif bir oyun var.' }, { quoted: msg })
    return
  }
  aktifOyunlar.add(state)

  const result = await sock.sendMessage(from, { text: lobiMetni(state), mentions: [sender] }, { quoted: msg })
  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Vampir lobi mesajının id\'si alınamadı, oyun iptal edildi')
    temizle(state)
    endGame(from)
    return
  }
  // Katılımlarda güncellenmez: herkes aynı lobi mesajına yanıt verir.
  setLastMessage(from, id)
  fazZamanla(state, LOBI_MS, 'lobi', () => lobiBitir(state))
}

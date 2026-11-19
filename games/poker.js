// .poker akışı: lobi, özelden kartlar, sıra zamanlayıcısı, el sonu ve masanın kapanışı.
// Kurallar lib/poker.js'tedir. Para oyuncular arasıdır: giriş katılırken `xpCek` ile alınır,
// masadan kalkarken `pokerKalk` ile önündeki çip cüzdana döner. Kasa ve hazine yoktur.
import logger from '../lib/logger.js'
import { kumarEngeli } from '../lib/kumar.js'
import {
  elBaslat, eliIadeEt, gorme, hamle, kartlarYaz, MAX_OYUNCU, masaKur, masadakiler, MIN_OYUNCU,
} from '../lib/poker.js'
import { binlik, miktarlariCoz } from '../lib/sayi.js'
import { getStats, kumarYasagi, pokerKalk, xpCek } from '../lib/stats.js'
import { displayName, mentionOf } from '../lib/target.js'
import { endGame, getGame, setLastMessage, startGame, touchGame } from './gameManager.js'
import { katla } from './kimim.js'

const LOBI_MS = 2 * 60_000
const HAMLE_MS = 90_000
const EL_ARASI_MS = 8_000
// Her hamlede yenilenir; yalnızca takılan masa yuvayı sonsuza dek tutmasın diye.
const GUVENLIK_MS = 10 * 60_000
// Üst üste bu kadar süresi dolan oyuncu masadan kaldırılır, kalanlar onu beklemesin.
const ZAMAN_ASIMI_SINIRI = 2

// Özelden `.poker` yazan oyuncunun masası buradan bulunur: özel sohbet grubu söylemez.
const aktifMasalar = new Set()

// Anahtarlar katla() çıktısıdır: Türkçe harfler ASCII'ye iner, noktalama atılır.
const HAMLELER = {
  pas: 'pas', check: 'pas', kontrol: 'pas',
  gor: 'gor', call: 'gor',
  artir: 'artir', raise: 'artir', yukselt: 'artir',
  hepsi: 'hepsi', allin: 'hepsi',
  cekil: 'cekil', fold: 'cekil', yat: 'cekil',
}

const masada = (state) => getGame(state.chatJid) === state && !state.finished
const isaretli = (n) => `${n >= 0 ? '+' : ''}${binlik(n)}`

function temizle(state) {
  state.finished = true
  clearTimeout(state.timer)
  aktifMasalar.delete(state)
}

function zamanla(state, ms, fn) {
  clearTimeout(state.timer)
  const adim = ++state.adim
  state.timer = setTimeout(() => {
    if (!masada(state) || state.adim !== adim) return
    fn().catch((err) => logger.error({ err, chatJid: state.chatJid }, 'Poker zamanlayıcısı işlenemedi'))
  }, ms)
  state.timer.unref?.()
  touchGame(state.chatJid)
}

// Grupta LID, özelde numara gelebilir: ikisine de bakılır.
function oyuncuBul(liste, parsed) {
  const kimlikler = [parsed.sender, parsed.senderPn].filter(Boolean)
  return liste.find((o) => kimlikler.includes(o.jid) || kimlikler.includes(o.pn)) || null
}

async function grubaYaz(state, text, mentions = [], { son = false } = {}) {
  const result = await state.sock.sendMessage(state.chatJid, { text, mentions })
  if (son) {
    const id = result?.key?.id
    if (!id) throw new Error('Poker masa mesajının id\'si alınamadı')
    setLastMessage(state.chatJid, id)
  }
  return result
}

/** Masadan kalkan ya da çipi biten oyuncunun hesabı hemen kapanır, önündeki çip cüzdana döner. */
function oyuncuCikar(state, o) {
  if (o.cikti) return
  const r = pokerKalk({ chatJid: state.chatJid, userJid: o.jid, giris: state.giris, kalan: o.stack })
  o.sonuc = r?.fark ?? o.stack - state.giris
  o.stack = 0
  o.cikti = true
  o.kalkti = true
}

/** Masa hangi anda kapanırsa kapansın para kaybolmaz: yarım elin katkıları iade edilir, herkes kalkar. */
function kapanisMetni(state, giris) {
  if (!state.masa) {
    for (const o of state.oyuncular) {
      pokerKalk({ chatJid: state.chatJid, userJid: o.jid, giris: state.giris, kalan: state.giris, kaydet: false })
    }
    state.oyuncular = []
    return `${giris}\nGirişler iade edildi.`
  }
  eliIadeEt(state.masa)
  for (const o of state.masa.oyuncular) oyuncuCikar(state, o)
  // Sıralama listesi değil ama herkesi etiketlemeye gerek yok: ad düz yazılır.
  const satirlar = [...state.masa.oyuncular]
    .sort((a, b) => b.sonuc - a.sonuc)
    .map((o) => `${o.sonuc >= 0 ? '🟢' : '🔴'} ${displayName(o.jid)}: ${isaretli(o.sonuc)} XP`)
  return [giris, '', '🧾 *Masa sonucu*', ...satirlar].join('\n')
}

async function masaKapat(state, giris) {
  temizle(state)
  endGame(state.chatJid)
  await grubaYaz(state, kapanisMetni(state, giris))
}

function masaMetni(state, ust) {
  const { masa } = state
  const sokak = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' }[masa.faz]
  const pot = masa.oyuncular.reduce((t, o) => t + o.katki, 0)
  const sira = masa.oyuncular[masa.sira]
  const borc = gorme(masa, sira)

  const liste = masa.oyuncular
    .filter((o) => o.elde)
    .map((o, i) => {
      const isaret = o.cekildi ? ' ❌' : o.hepsi ? ' 🔥hepsi' : o === sira ? ' ◀️' : ''
      const dealer = masa.oyuncular.indexOf(o) === masa.dealer ? ' Ⓓ' : ''
      return `${i + 1}. ${displayName(o.jid)}${dealer} · ${binlik(o.stack)}${o.tur ? ` (bu tur ${binlik(o.tur)})` : ''}${isaret}`
    })

  return [
    ...(ust ? [ust, ''] : []),
    `🃏 *POKER* · El ${masa.el} · ${sokak} · Körler ${binlik(masa.kucuk)}/${binlik(masa.buyuk)}`,
    `🂠 Masa: ${masa.board.length ? kartlarYaz(masa.board) : '—'}`,
    `💰 Pot: ${binlik(pot)}`,
    '',
    ...liste,
    '',
    `▶️ Sıra: ${mentionOf(sira.jid)}${borc ? ` · görmek için ${binlik(borc)}` : ''}`,
    `↩️ Bu mesaja: ${borc ? '`gör`' : '`pas`'} · \`artır <miktar>\` · \`hepsi\` · \`çekil\` (${HAMLE_MS / 1000} sn)`,
  ].join('\n')
}

async function siraSor(state, ust) {
  const o = state.masa.oyuncular[state.masa.sira]
  // Kalkan oyuncu sırası gelince çekilir, kimse onu beklemez.
  if (o.kalkti) return hamleIsle(state, o, 'cekil', 0, true)
  await grubaYaz(state, masaMetni(state, ust), [o.jid], { son: true })
  const { el, sira } = state.masa
  zamanla(state, HAMLE_MS, () => zamanAsimi(state, el, sira))
}

async function zamanAsimi(state, el, sira) {
  const { masa } = state
  if (masa.el !== el || masa.sira !== sira || masa.faz === 'bitti') return
  const o = masa.oyuncular[sira]
  o.zamanAsimi = (o.zamanAsimi ?? 0) + 1
  if (o.zamanAsimi >= ZAMAN_ASIMI_SINIRI) o.kalkti = true
  await hamleIsle(state, o, gorme(masa, o) ? 'cekil' : 'pas', 0, true)
}

async function hamleIsle(state, o, tip, miktar, otomatik = false) {
  const sonuc = hamle(state.masa, tip, miktar)
  if (sonuc.hata) return sonuc
  clearTimeout(state.timer)
  if (!otomatik) o.zamanAsimi = 0
  const ust = `${otomatik ? '⏱️ ' : ''}${displayName(o.jid)} ${sonuc.aciklama}${o.kalkti && tip === 'cekil' ? ' ve masadan kalkıyor' : ''}`
  if (state.masa.faz === 'bitti') await elSonu(state, ust)
  else await siraSor(state, ust)
  return sonuc
}

async function kartlariGonder(state) {
  const ulasmayan = []
  for (const o of state.masa.oyuncular.filter((x) => x.elde)) {
    try {
      await state.sock.sendMessage(o.pn, {
        text: `🃏 El ${state.masa.el}\nKartların: *${kartlarYaz(o.kartlar)}*\nÖnündeki çip: ${binlik(o.stack)}`,
      })
    } catch (err) {
      logger.error({ err, chatJid: state.chatJid }, 'Poker kartları özelden gönderilemedi')
      ulasmayan.push(o)
    }
  }
  return ulasmayan
}

async function elOyna(state) {
  if (!masada(state)) return
  if (!elBaslat(state.masa)) return masaKapat(state, '🃏 Masada oynayacak iki kişi kalmadı, masa kapandı.')

  const ulasmayan = await kartlariGonder(state)
  if (!masada(state)) return
  if (ulasmayan.length) {
    const metin = `Şu kişilere kartlarını özelden gönderemedim: ${ulasmayan.map((o) => mentionOf(o.jid)).join(' ')}`
    // İlk elde kimse oynamadan kapanır; sonraki ellerde oyuncu özelden `.poker` yazıp kartını ister.
    if (state.masa.el === 1) return masaKapat(state, `❌ ${metin}\nBota bir kez özelden yazıp tekrar deneyin.`)
    await grubaYaz(state, `⚠️ ${metin}\nBana özelden \`.poker\` yazınca kartların gelir.`, ulasmayan.map((o) => o.jid))
  }

  if (state.masa.faz === 'bitti') return elSonu(state, '🔥 Körler herkesi hepsi yaptı.')
  await siraSor(state, state.masa.el === 1 ? '🃏 Kartlar özelden dağıtıldı. Gelmediyse bana özelden `.poker` yaz.' : '')
}

async function elSonu(state, ust) {
  const { masa } = state
  const { sonuc } = masa
  const satirlar = [ust, '', `🃏 *El ${masa.el} bitti*`]
  if (sonuc.showdown) {
    satirlar.push(`🂠 Masa: ${kartlarYaz(masa.board)}`, '')
    for (const e of sonuc.eller) satirlar.push(`${displayName(e.oyuncu.jid)}: ${kartlarYaz(e.oyuncu.kartlar)} · ${e.ad}`)
  }
  satirlar.push('')
  sonuc.potlar.forEach((p, i) => {
    const ad = sonuc.potlar.length > 1 ? (i === 0 ? 'Ana pot' : `Yan pot ${i}`) : 'Pot'
    satirlar.push(`🏆 ${ad} (${binlik(p.miktar)}): ${p.kazananlar.map((o) => displayName(o.jid)).join(', ')}`)
  })

  const cikanlar = []
  for (const o of masa.oyuncular) {
    if (o.cikti || (o.stack > 0 && !o.kalkti)) continue
    const bitti = o.stack === 0
    cikanlar.push(bitti ? `💸 ${displayName(o.jid)} çipini bitirdi` : `🚶 ${displayName(o.jid)} masadan kalktı (${binlik(o.stack)})`)
    oyuncuCikar(state, o)
  }
  if (cikanlar.length) satirlar.push('', ...cikanlar)

  if (masadakiler(masa).length < MIN_OYUNCU) {
    temizle(state)
    endGame(state.chatJid)
    satirlar.push('', kapanisMetni(state, '🃏 Masada tek kişi kaldı, masa kapandı.'))
    return grubaYaz(state, satirlar.join('\n'))
  }

  satirlar.push('', `⏭️ Sonraki el ${EL_ARASI_MS / 1000} sn sonra. Kalkmak için masa mesajına \`kalk\` yaz.`)
  await grubaYaz(state, satirlar.join('\n'))
  zamanla(state, EL_ARASI_MS, () => elOyna(state))
}

function girisAl(state, jid) {
  const xp = getStats(state.chatJid, jid).xp
  const engel = kumarEngeli(xp, kumarYasagi(state.chatJid, jid))
  if (engel) return engel
  const r = xpCek({ chatJid: state.chatJid, userJid: jid, miktar: state.giris })
  if (!r || r.yetersiz) return `Masaya oturmak için ${binlik(state.giris)} XP gerekiyor, cüzdanında ${binlik(xp)} var.`
  return null
}

async function lobiCevap({ sock, msg, parsed, state, body }) {
  const yaz = (text, mentions = []) => sock.sendMessage(state.chatJid, { text, mentions }, { quoted: msg })
  const k = katla(body)
  const ben = oyuncuBul(state.oyuncular, parsed)

  if (k === 'katil') {
    if (ben) return yaz('Zaten masadasın.')
    if (state.oyuncular.length >= MAX_OYUNCU) return yaz(`Masa dolu (${MAX_OYUNCU} kişi).`)
    const engel = girisAl(state, parsed.sender)
    if (engel) return yaz(`❌ ${engel}`)
    state.oyuncular.push({ jid: parsed.sender, pn: parsed.senderPn || parsed.sender })
    return yaz(`✅ ${mentionOf(parsed.sender)} masaya oturdu, ${binlik(state.giris)} XP çip aldı (${state.oyuncular.length} kişi).`, [parsed.sender])
  }
  if (k === 'cik' || k === 'kalk') {
    if (!ben) return
    if (ben.jid === state.starterJid) return yaz('Masayı kuran çıkamaz, `.oyunbitir` ile kapatabilirsin.')
    state.oyuncular.splice(state.oyuncular.indexOf(ben), 1)
    pokerKalk({ chatJid: state.chatJid, userJid: ben.jid, giris: state.giris, kalan: state.giris, kaydet: false })
    return yaz(`👋 ${displayName(ben.jid)} masadan kalktı, girişi iade edildi (${state.oyuncular.length} kişi).`)
  }
  if (k === 'basla') {
    if (parsed.sender !== state.starterJid) return yaz('Oyunu yalnızca masayı kuran başlatabilir.')
    if (state.oyuncular.length < MIN_OYUNCU) return yaz(`En az ${MIN_OYUNCU} kişi gerekiyor, şu an ${state.oyuncular.length}.`)
    return lobiBitir(state)
  }
  return yaz('`katıl`, `çık` ya da `başla` yaz.')
}

async function lobiBitir(state) {
  if (state.faz !== 'lobi') return
  if (state.oyuncular.length < MIN_OYUNCU) {
    return masaKapat(state, `🃏 Yeterli oyuncu toplanmadı (en az ${MIN_OYUNCU}), masa açılmadı.`)
  }
  state.faz = 'masa'
  state.masa = masaKur({ oyuncular: state.oyuncular, giris: state.giris })
  await elOyna(state)
}

async function masaCevap({ sock, msg, parsed, state, body }) {
  const yaz = (text) => sock.sendMessage(state.chatJid, { text }, { quoted: msg })
  const { masa } = state
  const ben = oyuncuBul(masa.oyuncular, parsed)
  if (!ben || ben.cikti) return

  const [ilk, ...geri] = body.trim().split(/\s+/)
  const kelime = katla(ilk)
  if (kelime === 'kalk') {
    if (ben.kalkti) return
    ben.kalkti = true
    if (masa.faz !== 'bitti' && masa.oyuncular[masa.sira] === ben) return hamleIsle(state, ben, 'cekil', 0)
    if (masa.faz === 'bitti' || !ben.elde || ben.cekildi) return yaz('🚶 El bitince çipin cüzdanına döner.')
    return yaz('🚶 Sıran gelince çekileceksin, el bitince çipin cüzdanına döner.')
  }

  const tip = HAMLELER[kelime]
  if (!tip) return
  if (masa.faz === 'bitti') return yaz('Sonraki el birazdan başlıyor.')
  if (masa.oyuncular[masa.sira] !== ben) return yaz(`Sıra sende değil, ${displayName(masa.oyuncular[masa.sira].jid)} bekleniyor.`)

  const miktar = tip === 'artir' ? Number.parseInt(miktarlariCoz(geri).join(''), 10) : 0
  const sonuc = await hamleIsle(state, ben, tip, miktar)
  if (sonuc?.hata) await yaz(`❌ ${sonuc.hata}`)
}

async function cevapAl(args) {
  if (args.state.faz === 'lobi') return lobiCevap(args)
  if (args.state.faz === 'masa') return masaCevap(args)
}

function lobiMetni(state) {
  return [
    '🃏 *POKER MASASI* (Texas Hold\'em)', '',
    `${mentionOf(state.starterJid)} masa kuruyor. Giriş: *${binlik(state.giris)} XP*`,
    '↩️ Oturmak için *bu mesaja* `katıl`, kalkmak için `çık` yaz.',
    `Kuran \`başla\` yazınca ya da ${LOBI_MS / 60_000} dk dolunca oyun başlar (${MIN_OYUNCU}-${MAX_OYUNCU} kişi).`,
    'Para oyuncular arasındadır, kasa yoktur. Masa kapanınca önündeki çip cüzdanına döner.',
    '⚠️ Kartlar özelden gelir. Bota hiç özelden yazmamış olana ulaşamayabilirim.',
  ].join('\n')
}

/** Özelden `.poker`: kartları, masayı ve önündeki çipi yeniden yollar. */
export async function kartHatirlat({ sock, msg, parsed }) {
  const yaz = (text) => sock.sendMessage(parsed.from, { text }, { quoted: msg })
  for (const state of aktifMasalar) {
    if (!masada(state)) {
      temizle(state)
      continue
    }
    const ben = state.masa && oyuncuBul(state.masa.oyuncular, parsed)
    if (!ben || ben.cikti) continue
    if (!ben.elde || state.masa.faz === 'bitti') return yaz(`🃏 Şu an elde değilsin. Önündeki çip: ${binlik(ben.stack)}`)
    return yaz([
      `🃏 El ${state.masa.el}`,
      `Kartların: *${kartlarYaz(ben.kartlar)}*`,
      `Masa: ${state.masa.board.length ? kartlarYaz(state.masa.board) : '—'}`,
      `Önündeki çip: ${binlik(ben.stack)}`,
    ].join('\n'))
  }
  return yaz('Açık bir poker masasında değilsin. Masayı grupta `.poker <giriş>` ile kur.')
}

/** `.poker <giriş>` gövdesi. Çağıran grubu, boş oyun yuvasını ve tutarı denetlemiştir. */
export async function start({ sock, msg, from, sender, senderPn, giris }) {
  const state = startGame(from, {
    type: 'poker',
    starterJid: sender,
    sock,
    giris,
    faz: 'lobi',
    oyuncular: [],
    masa: null,
    adim: 0,
    lastMessageId: null,
    timeoutMs: GUVENLIK_MS,
    finished: false,
    timer: null,
    onAnswer: cevapAl,
    // .sus ve reborn oyunu doğrudan endGame ile kapatır; çip burada iade edilir. kapanisMetni
    // tekrar çağrılmaya dayanıklıdır (kalkan oyuncu bir daha ödenmez).
    onEnd: (s) => {
      temizle(s)
      kapanisMetni(s, '')
    },
    summarize: (s) => {
      temizle(s)
      return { text: kapanisMetni(s, '🛑 Poker masası kapatıldı.') }
    },
    onTimeout: async () => {
      temizle(state)
      await sock.sendMessage(from, { text: kapanisMetni(state, '⏱️ Poker masası uzun süre ilerlemedi, kapatıldı.') })
    },
  })
  if (!state) {
    await sock.sendMessage(from, { text: '⚠️ Bu grupta zaten aktif bir oyun var.' }, { quoted: msg })
    return
  }

  const engel = girisAl(state, sender)
  if (engel) {
    temizle(state)
    endGame(from)
    await sock.sendMessage(from, { text: `❌ ${engel}` }, { quoted: msg })
    return
  }
  state.oyuncular.push({ jid: sender, pn: senderPn || sender })
  aktifMasalar.add(state)

  const result = await sock.sendMessage(from, { text: lobiMetni(state), mentions: [sender] }, { quoted: msg })
  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Poker lobi mesajının id\'si alınamadı, masa kapatıldı')
    temizle(state)
    endGame(from)
    kapanisMetni(state, '')
    return
  }
  // Katılımlarda güncellenmez: herkes aynı lobi mesajına yanıt verir.
  setLastMessage(from, id)
  zamanla(state, LOBI_MS, () => lobiBitir(state))
}

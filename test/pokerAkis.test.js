// .poker akışı sahte soketle: lobi, katılım, özelden kartlar, hamleler ve hangi yoldan
// kapanırsa kapansın toplam XP'nin korunması. Veritabanı bellekte açılır.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { endGame, getGame, handleGameReply } = await import('../games/gameManager.js')
const { kartHatirlat, start } = await import('../games/poker.js')
const { getStats, xpAyarla } = await import('../lib/stats.js')

function sahteSoket() {
  let no = 0
  const giden = []
  return {
    giden,
    sendMessage: async (jid, icerik) => {
      giden.push({ jid, text: icerik.text ?? '' })
      return { key: { id: `M${++no}` } }
    },
  }
}

const G = 'poker@g.us'
const KISILER = ['a@s.whatsapp.net', 'b@s.whatsapp.net', 'c@s.whatsapp.net']

function yanit(sock, jid, body) {
  const state = getGame(G)
  const parsed = { isGroup: true, from: G, sender: jid, senderPn: jid, body, quoted: { key: { id: state.lastMessageId } } }
  return handleGameReply({ sock, msg: {}, parsed })
}

const toplamXp = () => KISILER.reduce((t, j) => t + getStats(G, j).xp, 0)

test('lobi, el oynanışı ve .sus gibi doğrudan kapanış: XP korunur', async () => {
  for (const j of KISILER) xpAyarla({ chatJid: G, userJid: j, miktar: 10_000 })
  const sock = sahteSoket()
  const once = toplamXp()

  await start({ sock, msg: {}, from: G, sender: KISILER[0], senderPn: KISILER[0], giris: 1000 })
  assert.equal(getStats(G, KISILER[0]).xp, 9000, 'kuranın girişi alındı')
  await yanit(sock, KISILER[1], 'katıl')
  await yanit(sock, KISILER[2], 'katıl')
  assert.equal(getStats(G, KISILER[2]).xp, 9000)
  await yanit(sock, KISILER[1], 'başla')
  assert.ok(sock.giden.at(-1).text.includes('yalnızca masayı kuran'))
  await yanit(sock, KISILER[0], 'başla')

  const state = getGame(G)
  assert.equal(state.faz, 'masa')
  const ozel = sock.giden.filter((m) => !m.jid.endsWith('@g.us'))
  assert.equal(ozel.length, 3, 'herkese kartları özelden gitti')
  assert.match(ozel[0].text, /Kartların: \*/)

  // Sırası olmayanın hamlesi reddedilir.
  const sira = state.masa.oyuncular[state.masa.sira]
  const baska = state.masa.oyuncular.find((o) => o !== sira)
  await yanit(sock, baska.jid, 'gör')
  assert.match(sock.giden.at(-1).text, /Sıra sende değil/)

  for (let i = 0; i < 3 && state.masa.faz === 'preflop'; i++) {
    await yanit(sock, state.masa.oyuncular[state.masa.sira].jid, 'gör')
  }
  assert.notEqual(state.masa.faz, 'preflop')
  assert.equal(toplamXp() + state.masa.oyuncular.reduce((t, o) => t + o.stack + o.katki, 0), once)

  // Özelden .poker kartları yeniden yollar.
  const dmSock = sahteSoket()
  await kartHatirlat({ sock: dmSock, msg: {}, parsed: { from: KISILER[1], sender: KISILER[1], senderPn: KISILER[1] } })
  assert.match(dmSock.giden[0].text, /Kartların/)

  // .sus ve reborn oyunu doğrudan endGame ile kapatır: çip iade edilmeli.
  endGame(G)
  assert.equal(getGame(G), null)
  assert.equal(toplamXp(), once, 'yarım el iade edildi, toplam XP aynı')
})

test('lobide çıkan ve açılmadan kapanan masa girişi iade eder', async () => {
  const sock = sahteSoket()
  const once = toplamXp()
  await start({ sock, msg: {}, from: G, sender: KISILER[0], senderPn: KISILER[0], giris: 500 })
  await yanit(sock, KISILER[1], 'katıl')
  await yanit(sock, KISILER[1], 'çık')
  assert.equal(toplamXp(), once - 500)
  endGame(G)
  assert.equal(toplamXp(), once)
})

test('kumar şartı: 500 XP altı oturamaz', async () => {
  const fakir = 'f@s.whatsapp.net'
  xpAyarla({ chatJid: G, userJid: fakir, miktar: 300 })
  const sock = sahteSoket()
  await start({ sock, msg: {}, from: G, sender: KISILER[0], senderPn: KISILER[0], giris: 200 })
  await yanit(sock, fakir, 'katıl')
  assert.match(sock.giden.at(-1).text, /en az 500 XP/)
  assert.equal(getStats(G, fakir).xp, 300)
  endGame(G)
})

test('tek kişi kalınca masa kapanır, kazanan kazancını alır', async () => {
  const sock = sahteSoket()
  const once = toplamXp()
  await start({ sock, msg: {}, from: G, sender: KISILER[0], senderPn: KISILER[0], giris: 1000 })
  await yanit(sock, KISILER[1], 'katıl')
  await yanit(sock, KISILER[0], 'başla')
  const state = getGame(G)
  // Sıradaki hepsi der, öteki görür: el showdown'a gider, biri çipini bitirir ya da bölüşürler.
  await yanit(sock, state.masa.oyuncular[state.masa.sira].jid, 'hepsi')
  await yanit(sock, state.masa.oyuncular[state.masa.sira].jid, 'gör')
  if (getGame(G)) endGame(G)
  assert.equal(toplamXp(), once)
  assert.ok(sock.giden.some((m) => m.text.includes('El 1 bitti')))
})

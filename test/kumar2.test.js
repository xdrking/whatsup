// Çok adımlı kumar oyunları, .vs, .piyango ve kumar karnesi.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { KAZI_ODULLERI, kaziCevir } = await import('../lib/kumar.js')
const { elDegeri, odemeCarpani, desteKur } = await import('../games/blackjack.js')
const { KUTU, MAYIN, mayinCarpani, mayinKur } = await import('../games/mayin.js')
const { agirlikliSec } = await import('../commands/piyango.js')
const { HISSELER } = await import('../lib/borsa.js')
const {
  addXp, bahisOyna, bankaCek, bankaYatir, borsaAl, borsaSat, botHesabiMi, botHesabiniTani, getStats, kumarOde,
  recordMessage, kumarSiralama, piyangoBilet, piyangoCek, vsOyna, xpCek,
} = await import('../lib/stats.js')

const el = (...d) => d.map((deger) => ({ deger, renk: '♠' }))

test('blackjack: as 1 ya da 11 sayılır', () => {
  assert.equal(elDegeri(el('A', 'K')), 21)
  assert.equal(elDegeri(el('A', 'A', '9')), 21)
  assert.equal(elDegeri(el('A', '9', '5')), 15)
  assert.equal(elDegeri(el('K', 'Q', '5')), 25)
})

test('blackjack: ödeme çarpanları', () => {
  assert.equal(odemeCarpani(el('A', 'K'), el('9', '9')), 2.5)
  assert.equal(odemeCarpani(el('A', 'K'), el('A', 'Q')), 1)
  assert.equal(odemeCarpani(el('K', '5', '6'), el('A', 'Q')), 0)
  assert.equal(odemeCarpani(el('K', 'Q', '5'), el('K', 'Q', '5')), 0)
  assert.equal(odemeCarpani(el('K', '9'), el('K', 'Q', '5')), 2)
  assert.equal(odemeCarpani(el('K', '9'), el('K', '8')), 2)
  assert.equal(odemeCarpani(el('K', '8'), el('K', '8')), 1)
  assert.equal(odemeCarpani(el('K', '7'), el('K', '8')), 0)
})

test('blackjack: deste 52 tekil kart', () => {
  const deste = desteKur()
  assert.equal(new Set(deste.map((k) => k.deger + k.renk)).size, 52)
})

test('mayın: çarpan artar, beklenen dönüş %96 civarı, mayın sayısı sabit', () => {
  assert.equal(mayinCarpani(0), 1)
  let sans = 1
  for (let k = 1; k <= KUTU - MAYIN; k += 1) {
    sans *= (KUTU - MAYIN - k + 1) / (KUTU - k + 1)
    assert.ok(mayinCarpani(k) > mayinCarpani(k - 1))
    const ev = sans * mayinCarpani(k)
    assert.ok(ev > 0.9 && ev <= 0.96, `${k}. kutu: ${ev}`)
  }
  assert.equal(mayinKur().size, MAYIN)
})

test('kazı: kart sonucu ödülle tutar, beklenen dönüş %90-100', () => {
  const ev = KAZI_ODULLERI.reduce((t, o) => t + (o.agirlik / 1000) * o.carpan, 0)
  assert.ok(ev > 0.9 && ev < 1, `beklenen dönüş ${ev}`)

  for (let i = 0; i < 300; i += 1) {
    const { kutular, carpan, sembol } = kaziCevir()
    assert.equal(kutular.length, 9)
    const sayilar = {}
    for (const k of kutular) sayilar[k] = (sayilar[k] || 0) + 1
    const uclu = Object.keys(sayilar).filter((k) => sayilar[k] >= 3)
    assert.deepEqual(uclu, sembol ? [sembol] : [])
    assert.equal(carpan > 0, Boolean(sembol))
  }
})

test('kasaya alınan bahis geri ödenir, karneye net yazılır', () => {
  const k = { chatJid: 'k1@g.us', userJid: 'u@lid' }
  addXp({ ...k, amount: 100 })

  assert.deepEqual(xpCek({ ...k, miktar: 150 }), { yetersiz: true, xp: 100 })
  assert.deepEqual(xpCek({ ...k, miktar: 60 }), { yetersiz: false, xp: 40 })
  assert.deepEqual(kumarOde({ ...k, bahis: 60, odeme: 120 }), { xp: 160, fark: 60 })
  assert.deepEqual(kumarSiralama(k.chatJid).kazananlar, [{ user_jid: 'u@lid', net: 60, games: 1 }])
})

test('bahis oyunları da karneye yazılır', () => {
  const k = { chatJid: 'k2@g.us', userJid: 'u@lid' }
  addXp({ ...k, amount: 100 })
  bahisOyna({ ...k, miktar: 40, cevir: () => ({ carpan: 0 }) })
  assert.deepEqual(kumarSiralama(k.chatJid).kaybedenler, [{ user_jid: 'u@lid', net: -40, games: 1 }])
})

test('vs: kazanan alır, biri yetmezse kimseye dokunulmaz', () => {
  const chatJid = 'v@g.us'
  addXp({ chatJid, userJid: 'a', amount: 100 })
  addXp({ chatJid, userJid: 'b', amount: 30 })

  assert.deepEqual(vsOyna({ chatJid, a: 'a', b: 'b', miktar: 50, sec: () => 'a' }), { yetersiz: 'b', xp: 30 })
  assert.equal(getStats(chatJid, 'a').xp, 100)

  const s = vsOyna({ chatJid, a: 'a', b: 'b', miktar: 30, sec: () => 'b' })
  assert.deepEqual(s, { kazanan: 'b', kaybeden: 'a', kazananXp: 60, kaybedenXp: 70 })
})

test('piyango: tek kişiyle çekilmez, kazanan havuzu alır, havuz sıfırlanır', () => {
  const chatJid = 'p@g.us'
  addXp({ chatJid, userJid: 'a', amount: 100 })
  addXp({ chatJid, userJid: 'b', amount: 100 })

  piyangoBilet({ chatJid, userJid: 'a', miktar: 60 })
  assert.deepEqual(piyangoCek({ chatJid, sec: agirlikliSec }), { yetersiz: true })
  assert.equal(piyangoBilet({ chatJid, userJid: 'b', miktar: 500 }).yetersiz, true)
  piyangoBilet({ chatJid, userJid: 'b', miktar: 40 })

  assert.deepEqual(piyangoCek({ chatJid, sec: () => 'b' }), { kazanan: 'b', havuz: 100, kisi: 2 })
  assert.equal(getStats(chatJid, 'b').xp, 160)
  assert.equal(getStats(chatJid, 'a').xp, 40)
  assert.deepEqual(piyangoCek({ chatJid, sec: agirlikliSec }), { yetersiz: true })
})

test('piyango seçimi yatırılan XP oranındadır', () => {
  const biletler = [{ user_jid: 'a', xp: 30 }, { user_jid: 'b', xp: 70 }]
  assert.equal(agirlikliSec(biletler, () => 29), 'a')
  assert.equal(agirlikliSec(biletler, () => 30), 'b')
})

test('bot hesabı: bota karşı kaybedilen XP bot numarasının satırına gider', () => {
  const chatJid = 'bot-hesabi@g.us'
  const bot = '905550000000@s.whatsapp.net'
  botHesabiniTani({ id: '905550000000:12@s.whatsapp.net', lid: '777:12@lid' })
  assert.equal(botHesabiMi(bot), true)
  assert.equal(botHesabiMi('777@lid'), true)

  addXp({ chatJid, userJid: bot, amount: 5 })
  addXp({ chatJid, userJid: 'a', amount: 1000 })

  bahisOyna({ chatJid, userJid: 'a', miktar: 100, cevir: () => ({ carpan: 0 }) })
  assert.equal(getStats(chatJid, bot).xp, 105)

  bahisOyna({ chatJid, userJid: 'a', miktar: 100, cevir: () => ({ carpan: 2 }) })
  assert.equal(getStats(chatJid, bot).xp, 105)

  xpCek({ chatJid, userJid: 'a', miktar: 50 })
  kumarOde({ chatJid, userJid: 'a', bahis: 50, odeme: 0 })
  assert.equal(getStats(chatJid, bot).xp, 155)

  xpCek({ chatJid, userJid: 'a', miktar: 50 })
  kumarOde({ chatJid, userJid: 'a', bahis: 50, odeme: 50 })
  assert.equal(getStats(chatJid, bot).xp, 155)

  bahisOyna({ chatJid, userJid: bot, miktar: 55, cevir: () => ({ carpan: 0 }) })
  assert.equal(getStats(chatJid, bot).xp, 100)

  addXp({ chatJid, userJid: 'b', amount: 100 })
  vsOyna({ chatJid, a: 'a', b: 'b', miktar: 10, sec: () => 'a' })
  piyangoBilet({ chatJid, userJid: 'a', miktar: 10 })
  piyangoBilet({ chatJid, userJid: 'b', miktar: 10 })
  piyangoCek({ chatJid, sec: () => 'b' })
  assert.equal(getStats(chatJid, bot).xp, 100)

  botHesabiniTani(null)
})

test('bot hesabı: banka kesintisi, servet vergisi ve borsa komisyonu bota gider', () => {
  const chatJid = 'bot-kesinti@g.us'
  const bot = '905550000000@s.whatsapp.net'
  const hisse = HISSELER[0]
  botHesabiniTani({ id: bot })
  addXp({ chatJid, userJid: 'a', amount: 2_000_000 })

  recordMessage({ chatJid, userJid: 'a', type: 'conversation' })
  assert.equal(getStats(chatJid, bot).xp, 20_000)

  bankaYatir({ chatJid, userJid: 'a', miktar: 1000 })
  const cekim = bankaCek({ chatJid, userJid: 'a', miktar: 1000 })
  assert.equal(cekim.kesinti, 50)
  assert.equal(getStats(chatJid, bot).xp, 20_050)

  const alis = borsaAl({ chatJid, userJid: 'a', hisse, miktar: 1000 })
  assert.equal(getStats(chatJid, bot).xp, 20_050 + alis.komisyon)

  const satis = borsaSat({ chatJid, userJid: 'a', hisse })
  assert.equal(getStats(chatJid, bot).xp, 20_050 + alis.komisyon + satis.komisyon)

  botHesabiniTani(null)
})

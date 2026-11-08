// .servet, .kumarkarnem ve .tabu: soket gerektirmeyen kısım.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { bozdurmaDegeri } = await import('../lib/coin.js')
const {
  addXp, bahisOyna, bankaYatir, botHesabiniTani, coinAl, coinDurumu, kumarKarnesi, kumarOde, servetDurumu, servetSiralama, vsOyna,
} = await import('../lib/stats.js')
const { tahminDogru, yasakliBul } = await import('../games/tabu.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const BOT = '905550000000@s.whatsapp.net'
botHesabiniTani({ id: BOT })

let sayac = 0
const yeniGrup = () => `s${++sayac}@g.us`

test('servet: cüzdan, banka ve coin toplanır, net doğru', () => {
  const chatJid = yeniGrup()
  addXp({ chatJid, userJid: 'a@lid', amount: 50_000_000 })
  bankaYatir({ chatJid, userJid: 'a@lid', miktar: 10_000_000, now: T })
  coinAl({ chatJid, userJid: 'a@lid', adet: 2, now: T })

  const s = servetDurumu({ chatJid, userJid: 'a@lid', now: T })
  assert.equal(s.banka, 10_000_000)
  assert.equal(s.coinAdet, coinDurumu(chatJid, 'a@lid').bakiye)
  assert.ok(s.coin > 0 && s.coin < 2 * 1_000_000_000)
  assert.equal(s.net, s.cuzdan + s.banka + s.coin)
  assert.equal(s.borc, 0)
})

test('servet sıralaması nete göre, bot yok', () => {
  const chatJid = yeniGrup()
  addXp({ chatJid, userJid: 'a@lid', amount: 100 })
  addXp({ chatJid, userJid: 'b@lid', amount: 300 })
  addXp({ chatJid, userJid: BOT, amount: 9_000 })
  assert.deepEqual(servetSiralama({ chatJid, now: T }).map((r) => r.user_jid), ['b@lid', 'a@lid'])
})

test('kumar karnesi oyun oyun yazılır, en büyük vurgun tutulur', () => {
  const chatJid = yeniGrup()
  addXp({ chatJid, userJid: 'a@lid', amount: 1000 })
  addXp({ chatJid, userJid: 'b@lid', amount: 1000 })
  bahisOyna({ chatJid, userJid: 'a@lid', miktar: 100, oyun: 'slot', cevir: () => ({ carpan: 3 }) })
  bahisOyna({ chatJid, userJid: 'a@lid', miktar: 50, oyun: 'slot', cevir: () => ({ carpan: 0 }) })
  kumarOde({ chatJid, userJid: 'a@lid', bahis: 100, odeme: 0, oyun: 'mayın' })
  vsOyna({ chatJid, a: 'a@lid', b: 'b@lid', miktar: 10, sec: () => 'a@lid' })

  const { toplam, oyunlar } = kumarKarnesi(chatJid, 'a@lid')
  assert.equal(toplam.games, 4)
  const slot = oyunlar.find((o) => o.oyun === 'slot')
  assert.deepEqual([slot.won, slot.lost, slot.games, slot.en_buyuk, slot.en_kotu], [200, 50, 2, 200, 50])
  assert.equal(oyunlar.find((o) => o.oyun === 'vs').won, 10)
  assert.equal(oyunlar.find((o) => o.oyun === 'mayın').lost, 100)
})

test('tabu: yasaklı sözcük ekli haliyle yakalanır, kısa yasaklı tam eşleşir', () => {
  const kart = { kelime: 'Deniz', yasak: ['su', 'dalga', 'plaj'] }
  assert.equal(yasakliBul('dalgalar çok büyük', kart), 'dalga')
  assert.equal(yasakliBul('DENİZE giriyoruz', kart), 'Deniz')
  assert.equal(yasakliBul('su gibi', kart), 'su')
  assert.equal(yasakliBul('sunmak lazım', kart), null)
  assert.equal(yasakliBul('mavi ve tuzlu', kart), null)
})

test('tabu: tahmin cümle içinde de kabul edilir', () => {
  assert.ok(tahminDogru('deniz mi?', 'Deniz'))
  assert.ok(tahminDogru('İNSTAGRAM', 'Instagram'))
  assert.ok(!tahminDogru('denizci', 'Deniz'))
})

test('bozdurma değeri servetle tutarlı', () => {
  assert.equal(bozdurmaDegeri(1, 1_000_000), 900_000)
})

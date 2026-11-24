// Panel yeni açıldığında SulyMarket fiyatı WhatsApp'takiyle aynı olmalı: bot (hazine) en zenginler ortalamasına girmemeli.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const klasor = mkdtempSync(path.join(tmpdir(), 'panelkat-'))
process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = path.join(klasor, 'test.db')

const { getDb } = await import('../lib/db.js')
const { sifreHashle } = await import('../panel/guvenlik.js')
const { panelKaydet } = await import('../lib/panelHesap.js')
const { botHesabiMi, botHesabiniTani, sulyMarketKati } = await import('../lib/stats.js')
const { sunucuKur } = await import('../panel/sunucu.js')
const { veriAc } = await import('../panel/veri.js')

const GRUP = 'g1@g.us'
const BOT = 'bot@s.whatsapp.net'
const gun = new Date().toISOString().slice(0, 10)
getDb().exec(`
  INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES
    ('${GRUP}', '111@lid', 10, 0, 0, 2000000000, 1), ('${GRUP}', '222@lid', 10, 0, 0, 1000000000, 1), ('${GRUP}', '${BOT}', 0, 0, 0, 0, 1);
  INSERT INTO banka (chat_jid, user_jid, bakiye, faiz_saat, faiz_artik, bekleyen) VALUES ('${GRUP}', '${BOT}', 900000000000000, ${Math.floor(Date.now() / 3_600_000)}, 0, 0);
  INSERT INTO ayar (anahtar, deger) VALUES ('bot_jid', '${BOT}');
  INSERT INTO ekonomi (chat_jid, day, arz, kur) VALUES ('${GRUP}', '${gun}', 3000000000, 30000000);
  INSERT INTO kripto_fiyat (sembol, usd, zaman) VALUES ('BTC', 100000, ${Date.now()});
  INSERT INTO faiz (chat_jid, oran) VALUES ('${GRUP}', 0);
`)
panelKaydet({ uyelikler: [{ chatJid: GRUP, userJid: '111@lid' }], numara: '905551112233', lid: '111', sifre: await sifreHashle('s') })

const veri = veriAc()
const sunucu = sunucuKur({ sifreHash: await sifreHashle('y'), veri, yedekKlasoru: path.join(klasor, 'yedek') })
await new Promise((tamam) => sunucu.listen(0, '127.0.0.1', tamam))
const adres = `http://127.0.0.1:${sunucu.address().port}`
after(() => {
  sunucu.close()
  veri.db.close()
  rmSync(klasor, { recursive: true, force: true })
})

test('panel hiç işlem yapılmadan açılsa da SulyMarket katı WhatsApp\'takiyle aynı', async () => {
  assert.equal(botHesabiMi(BOT), false, 'panel bu süreçte botu henüz tanımıyor')
  const giris = await fetch(`${adres}/giris`, {
    method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ kimlik: '905551112233', sifre: 's' }),
  })
  const Cookie = giris.headers.get('set-cookie').split(';')[0]
  const html = await (await fetch(`${adres}/oyun/sulymarket?grup=${encodeURIComponent(GRUP)}`, { headers: { Cookie } })).text()
  const panelKat = Number((html.match(/taban x([\d.,]+)/)?.[1] ?? '1').replace(/\./g, '').replace(',', '.'))

  botHesabiniTani({ id: BOT })
  const whatsappKat = sulyMarketKati({ chatJid: GRUP })
  assert.ok(whatsappKat > 1, 'deneme verisi katı 1\'in üstüne çıkarmalı')
  assert.equal(panelKat, whatsappKat)
})

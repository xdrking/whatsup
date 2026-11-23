// Panelin Suly borsası ve SulyMarket sayfaları. Fiyat servisi sahtedir, ağa çıkılmaz.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const klasor = mkdtempSync(path.join(tmpdir(), 'panelsuly-'))
process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = path.join(klasor, 'test.db')

const { getDb } = await import('../lib/db.js')
const { BIRIM } = await import('../lib/kripto.js')
const { URUNLER } = await import('../lib/sulymarket.js')
const { sifreHashle } = await import('../panel/guvenlik.js')
const { panelKaydet } = await import('../lib/panelHesap.js')
const { getStats, karaborsaDurumu, nftListesi } = await import('../lib/stats.js')
const { sunucuKur } = await import('../panel/sunucu.js')
const { veriAc } = await import('../panel/veri.js')

const GRUP = 'g1@g.us'
const UYE = '111@lid'
const db = getDb()
db.exec(`
  INSERT INTO stats (chat_jid, user_jid, messages, stickers, voices, xp, last_seen) VALUES
    ('${GRUP}', '${UYE}', 10, 0, 0, 100000000, 1), ('${GRUP}', 'bot@s.whatsapp.net', 0, 0, 0, 0, 1);
  INSERT INTO ayar (anahtar, deger) VALUES ('bot_jid', 'bot@s.whatsapp.net');
  INSERT INTO ekonomi (chat_jid, day, arz, kur) VALUES ('${GRUP}', '${new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)}', 1, 900000);
`)
panelKaydet({ uyelikler: [{ chatJid: GRUP, userJid: UYE }], numara: '905551112233', lid: '111', sifre: await sifreHashle('oyuncu-sifresi') })

let usd = 60_000
const simdi = Date.now()
const veri = veriAc()
const sunucu = sunucuKur({
  sifreHash: await sifreHashle('yonetici'), veri, yedekKlasoru: path.join(klasor, 'yedek'),
  fiyat: async () => usd && { usd, zaman: Date.now() },
  gecmis: async (ad) => (usd ? Array.from({ length: 30 }, (_, i) => ({ zaman: simdi - (30 - i) * (ad === '30g' ? 86_400_000 : 900_000), usd: 59_000 + i * 20 })) : []),
})
await new Promise((tamam) => sunucu.listen(0, '127.0.0.1', tamam))
const adres = `http://127.0.0.1:${sunucu.address().port}`
after(() => {
  sunucu.close()
  veri.db.close()
  rmSync(klasor, { recursive: true, force: true })
})

const post = (yol, alanlar, Cookie = '') => fetch(adres + yol, {
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(Cookie ? { Cookie } : {}) },
  body: new URLSearchParams(alanlar),
})
const Cookie = (await post('/giris', { kimlik: '905551112233', sifre: 'oyuncu-sifresi' })).headers.get('set-cookie').split(';')[0]
const al = async (yol) => (await fetch(adres + yol, { headers: { Cookie } })).text()
const g = encodeURIComponent(GRUP)
const bekle = () => new Promise((r) => setTimeout(r, 750))
const islem = async (sayfa, ad, ek = {}) => {
  await bekle()
  await post('/oyun/islem', { grup: GRUP, sayfa, islem: ad, ...ek }, Cookie)
  return al(`/oyun/${sayfa}?grup=${g}`)
}
const birim = () => karaborsaDurumu({ chatJid: GRUP, userJid: UYE }).birim

test('Suly sayfası: fiyat, grafikler, satır içi betik ve stil yok', async () => {
  const html = await al(`/oyun/suly?grup=${g}&aralik=1s`)
  assert.ok(html.includes('$60.000'))
  assert.ok(html.includes('Canlı'))
  assert.equal(html.match(/<svg class="cizgi-grafik/g).length, 6, 'üç grafik, iki boy')
  assert.ok(html.includes('aria-current="true">1 saat'))
  assert.ok(!/ style="/.test(html) && !/<script(?![^>]*src=)/.test(html))
  assert.ok(!html.includes('NaN') && !html.includes('undefined'))
  assert.ok((await al(`/oyun/suly?grup=${g}&aralik=constructor`)).includes('aria-current="true">24 saat'))

  const canli = await al(`/oyun/suly-canli?grup=${g}&aralik=24s`)
  assert.ok(canli.trim().startsWith('<div id="suly-canli"'))
  assert.equal((await fetch(`${adres}/oyun/suly-canli?grup=baska`, { headers: { Cookie } })).status, 404)
  assert.ok((await fetch(`${adres}/oyun/suly-canli?grup=${g}`)).url.endsWith('/giris'))
})

test('Suly alım satımı: fiyat formdan gelmez, kesinti hazineye', async () => {
  assert.ok((await islem('suly', 'suly-al', { tutar: '2', usd: '0.01' })).includes('2 Suly aldın'))
  assert.equal(birim(), 2 * BIRIM)
  const { xp } = getStats(GRUP, UYE)
  assert.ok(100_000_000 - xp > 40_000, 'formdaki usd yok sayılır')
  assert.ok((await islem('suly', 'suly-al', { tutar: 'abc' })).includes('Kaç Suly'))
  assert.ok((await islem('suly', 'suly-sat', { tutar: '0,5' })).includes('0,5 Suly sattın'))
  assert.ok((await islem('suly', 'suly-sat', { tutar: 'hepsi' })).includes('1,5 Suly sattın'))
  assert.equal(birim(), 0)
  assert.ok(getStats(GRUP, UYE).xp > xp && getStats(GRUP, UYE).xp < 100_000_000)
})

test('fiyat servisi düşünce alım satım kapanır, sayfa açılır', async () => {
  usd = 0
  const html = await islem('suly', 'suly-al', { tutar: '1' })
  assert.ok(html.includes('alım satım kapalı'))
  assert.equal(birim(), 0)
  usd = 60_000
})

test('SulyMarket: ürün, kutu, NFT al ve boz', async () => {
  db.prepare('INSERT OR REPLACE INTO kripto (chat_jid, user_jid, birim) VALUES (?, ?, ?)').run(GRUP, UYE, 1000 * BIRIM)
  const html = await al(`/oyun/sulymarket?grup=${g}`)
  for (const u of URUNLER) assert.ok(html.includes(`name="urun" value="${u.kod}"`), u.kod)
  assert.ok(html.includes('src="/nft/30.png"'))

  assert.ok((await islem('sulymarket', 'market-al', { urun: 'vpn', tutar: '2' })).includes('VPN x2'))
  assert.equal(birim(), 970 * BIRIM)
  assert.ok((await islem('sulymarket', 'market-al', { urun: 'tabanca', tutar: '1' })).includes('çeten olmalı'))
  assert.ok((await islem('sulymarket', 'market-al', { urun: 'kutu', tutar: '3' })).includes('tek tek'))
  assert.ok((await islem('sulymarket', 'market-al', { urun: 'constructor' })).includes('Böyle bir ürün yok'))
  assert.ok((await islem('sulymarket', 'nft-al', { urun: '30' })).includes('artık senin'))
  assert.deepEqual(nftListesi(GRUP, UYE).map((r) => r.no), [30])
  assert.ok((await al(`/s/profil?grup=${g}&id=${encodeURIComponent(UYE)}`)).includes('NFT koleksiyonu'))
  assert.ok((await islem('sulymarket', 'nft-boz', { urun: '30' })).includes('markete döndü'))
  assert.ok((await islem('sulymarket', 'nft-boz', { urun: '30' })).includes('senin değil'))
  await bekle()
  await post('/oyun/islem', { grup: GRUP, sayfa: 'sulymarket', islem: 'market-al', urun: 'kutu' }, Cookie)
  assert.equal(birim(), 935 * BIRIM)
})

test('NFT görseli PNG olarak gelir, bilinmeyen numara 404', async () => {
  const y = await fetch(`${adres}/nft/1.png`)
  assert.equal(y.headers.get('content-type'), 'image/png')
  assert.ok((await y.arrayBuffer()).byteLength > 500)
  assert.equal((await fetch(`${adres}/nft/0.png`)).status, 404)
  assert.equal((await fetch(`${adres}/nft/99.png`)).status, 404)
})

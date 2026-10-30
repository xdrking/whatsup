// Komut kayıt defteri ve içerik havuzlarının bütünlüğü: yeni komut ya da
// havuz satırı eklerken yapılan biçim hatalarını bot açılmadan yakalar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { loadCommands } = await import('../commands/index.js')
const commands = await loadCommands()
const tekil = [...new Set(commands.values())]

const KATEGORILER = new Set(['medya', 'eğlence', 'grup', 'istatistik', 'araç', 'oyun'])

test('bütün komut dosyaları yüklendi, ad çakışması yok', async () => {
  const dosyalar = (await readdir(new URL('../commands/', import.meta.url))).filter(
    (f) => f.endsWith('.js') && f !== 'index.js',
  )
  assert.equal(tekil.length, dosyalar.length)

  const adlar = tekil.flatMap((c) => [c.name, ...(c.aliases || [])].map((a) => a.toLowerCase()))
  assert.equal(new Set(adlar).size, adlar.length, 'bir ad ya da alias iki komutta kullanılmış')
})

test('her komut sözleşmeye uyar', () => {
  for (const c of tekil) {
    assert.equal(typeof c.execute, 'function', c.name)
    assert.ok(c.description && c.usage, `${c.name}: description/usage eksik`)
    assert.ok(KATEGORILER.has(c.category), `${c.name}: bilinmeyen kategori "${c.category}"`)
    if (c.details) assert.ok(c.details.every((s) => typeof s === 'string' && s), `${c.name}: details`)
    if (c.cooldown !== undefined) assert.ok(Number.isFinite(c.cooldown) && c.cooldown >= 0, c.name)
  }
})

test('data/*.json havuzları boş olmayan string dizisi', async () => {
  const klasor = new URL('../data/', import.meta.url)
  for (const f of (await readdir(klasor)).filter((x) => x.endsWith('.json'))) {
    const veri = JSON.parse(await readFile(new URL(f, klasor), 'utf8'))
    assert.ok(Array.isArray(veri) && veri.length, f)
    assert.ok(veri.every((s) => typeof s === 'string' && s.trim()), f)
  }
})

test('games/kimim.json: tekrar eden isim yok, her kayıtta ipucu var', async () => {
  const veri = JSON.parse(await readFile(new URL('../games/kimim.json', import.meta.url), 'utf8'))
  const adlar = veri.map((k) => k.name)
  assert.equal(new Set(adlar).size, adlar.length, 'aynı isim iki kez var')
  assert.ok(veri.every((k) => Array.isArray(k.hints) && k.hints.length))
})

test('games/quiz.json: cevap her zaman şıklardan biri', async () => {
  const veri = JSON.parse(await readFile(new URL('../games/quiz.json', import.meta.url), 'utf8'))
  for (const s of veri) {
    assert.ok(s.options.includes(s.answer), s.question)
    assert.equal(new Set(s.options).size, s.options.length, `${s.question}: aynı şık iki kez`)
  }
})

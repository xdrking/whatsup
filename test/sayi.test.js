// lib/sayi.js: komut argümanlarındaki yazılı tutarlar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { miktarlariCoz } from '../lib/sayi.js'

const coz = (metin) => miktarlariCoz(metin.split(' '))

test('ayrı ve bitişik birimler sayıya döner', () => {
  assert.deepEqual(coz('çek 50 milyon'), ['çek', '50000000'])
  assert.deepEqual(coz('çek 50milyon'), ['çek', '50000000'])
  assert.deepEqual(coz('çek 50 MİLYON'), ['çek', '50000000'])
  assert.deepEqual(coz('yatır 1,5 milyar'), ['yatır', '1500000000'])
  assert.deepEqual(coz('yatır 2.25milyar'), ['yatır', '2250000000'])
  assert.deepEqual(coz('yatır 50m'), ['yatır', '50000000'])
  assert.deepEqual(coz('yatır 20k'), ['yatır', '20000'])
  assert.deepEqual(coz('yatır 3 bin'), ['yatır', '3000'])
  assert.deepEqual(coz('yatır 1,15 milyar'), ['yatır', '1150000000'])
})

test('binlik noktalı sayı düzleşir, birim alabilir', () => {
  assert.deepEqual(coz('çek 50.000.000'), ['çek', '50000000'])
  assert.deepEqual(coz('çek 1.500 milyon'), ['çek', '1500000000'])
})

test('birimsiz ondalık, sözcükler ve sınırı aşan tutar olduğu gibi kalır', () => {
  assert.deepEqual(coz('0,25'), ['0,25'])
  assert.deepEqual(coz('100 2.5'), ['100', '2.5'])
  assert.deepEqual(coz('çek hepsi'), ['çek', 'hepsi'])
  assert.deepEqual(coz('@222 50 m'), ['@222', '50', 'm'])
  assert.deepEqual(coz('ver kalem bin'), ['ver', 'kalem', 'bin'])
  assert.deepEqual(coz('99 katrilyon'), ['99', 'katrilyon'])
})

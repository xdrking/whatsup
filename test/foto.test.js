// .foto efektleri: her efekt gerçek bir görselden geçerli JPEG üretmeli.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'

process.env.LOG_LEVEL = 'silent'

const { EFEKTLER } = await import('../commands/foto.js')

// 300x200 iki renkli deneme görseli; piksel efektinin boyutu koruduğu da görülsün.
const kaynak = await sharp({
  create: { width: 300, height: 200, channels: 3, background: { r: 200, g: 80, b: 40 } },
})
  .composite([{ input: Buffer.from('<svg width="300" height="200"><rect x="100" width="100" height="200" fill="#2060c0"/></svg>') }])
  .png()
  .toBuffer()

for (const [ad, efekt] of Object.entries(EFEKTLER)) {
  test(`foto: ${ad}`, async () => {
    const sonuc = await (await efekt.uygula(sharp(kaynak))).jpeg().toBuffer()
    const meta = await sharp(sonuc).metadata()

    assert.equal(meta.format, 'jpeg')
    assert.equal(meta.width, 300)
    assert.equal(meta.height, 200)
  })
}

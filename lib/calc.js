// `.hesap` için küçük aritmetik ayrıştırıcı. eval/Function kullanılmaz: grupta
// herkes yazabildiği için girdi asla kod olarak çalıştırılmamalı.
//
// Dilbilgisi (öncelik aşağıdan yukarı artar):
//   ifade  = terim (("+" | "-") terim)*
//   terim  = us (("*" | "/" | "%") us)*
//   us     = tekli ("^" us)?            sağdan birleşir: 2^3^2 = 2^9
//   tekli  = ("-" | "+") tekli | atom
//   atom   = sayı | "(" ifade ")"

export class CalcError extends Error {}

const ESDEGER = { '×': '*', x: '*', X: '*', '÷': '/', ':': '/', '−': '-' }

function tokenize(input) {
  const tokens = []
  let i = 0

  while (i < input.length) {
    const ch = ESDEGER[input[i]] || input[i]

    if (/\s/.test(ch)) {
      i++
      continue
    }

    if (/[0-9.,]/.test(ch)) {
      let j = i
      while (j < input.length && /[0-9.,]/.test(input[j])) j++
      // Türkçe ondalık virgülü: "3,5" = 3.5. Binlik ayırıcı desteklenmez.
      const ham = input.slice(i, j).replace(',', '.')
      const sayi = Number(ham)
      if (!Number.isFinite(sayi) || /[.,].*[.,]/.test(input.slice(i, j))) {
        throw new CalcError(`"${input.slice(i, j)}" sayı değil`)
      }
      tokens.push(sayi)
      i = j
      continue
    }

    if ('+-*/%^()'.includes(ch)) {
      tokens.push(ch)
      i++
      continue
    }

    throw new CalcError(`"${input[i]}" anlaşılmadı`)
  }

  return tokens
}

export function calculate(input) {
  const tokens = tokenize(input)
  let pos = 0

  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function atom() {
    const t = next()
    if (typeof t === 'number') return t
    if (t === '(') {
      const deger = ifade()
      if (next() !== ')') throw new CalcError('parantez kapanmamış')
      return deger
    }
    throw new CalcError('ifade eksik')
  }

  function tekli() {
    if (peek() === '-') {
      next()
      return -tekli()
    }
    if (peek() === '+') {
      next()
      return tekli()
    }
    return atom()
  }

  function us() {
    const taban = tekli()
    if (peek() === '^') {
      next()
      return taban ** us()
    }
    return taban
  }

  function terim() {
    let deger = us()
    while (['*', '/', '%'].includes(peek())) {
      const op = next()
      const sag = us()
      if (op === '*') deger *= sag
      else if (op === '/') deger /= sag
      else deger %= sag
    }
    return deger
  }

  function ifade() {
    let deger = terim()
    while (peek() === '+' || peek() === '-') {
      deger = next() === '+' ? deger + terim() : deger - terim()
    }
    return deger
  }

  if (!tokens.length) throw new CalcError('ifade boş')

  const sonuc = ifade()
  if (pos !== tokens.length) throw new CalcError('fazladan karakter var')
  if (!Number.isFinite(sonuc)) throw new CalcError('sonuç tanımsız (sıfıra bölme olabilir)')

  return sonuc
}

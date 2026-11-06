const bicim = new Intl.NumberFormat('tr-TR')

/** 2000000 → "2.000.000". Mesajlardaki XP tutarları için. */
export const binlik = (n) => bicim.format(n)

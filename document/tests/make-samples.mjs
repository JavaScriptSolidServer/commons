// Writes samples/minutes.pdf: a one-page PDF made by hand (no dependency), with a correct xref.
//   node tests/make-samples.mjs
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const lines = [
  ['F2', 20, 'Garden club: minutes, 14 November'],
  ['F1', 12, 'Present: Alice (chair), Bob, Carol. All at example.org.'],
  ['F1', 12, '1. Compost: Bob will turn it in March.'],
  ['F1', 12, '2. Seeds: Carol orders potatoes and peas by 1 February.'],
  ['F1', 12, '3. The north gate: Alice will fix the latch.'],
  ['F1', 12, 'Next meeting: 12 December, at Carol\'s.']
]
const esc = (t) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
let y = 760
const stream = lines.map(([font, sizePt, text], i) => { const s = `BT /${font} ${sizePt} Tf 72 ${y} Td (${esc(text)}) Tj ET`; y -= i === 0 ? 40 : 22; return s }).join('\n') +
  '\n0.16 0.34 0.79 RG 2 w 72 742 m 540 742 l S'
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
]
let out = '%PDF-1.4\n'
const offsets = []
objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${body}\nendobj\n` })
const xref = Buffer.byteLength(out)
out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
const file = path.join(import.meta.dirname, '..', 'samples', 'minutes.pdf')
writeFileSync(file, out)
console.log('wrote ' + file + ' (' + Buffer.byteLength(out) + ' bytes)')

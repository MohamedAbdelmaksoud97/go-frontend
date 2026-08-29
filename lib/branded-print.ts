type BrandedPrintOptions = {
  title: string
  subtitle: string
  body: string
  extraStyles?: string
  windowFeatures?: string
}

const baseStyles = `
  @page{size:A4 portrait;margin:12mm}
  *{box-sizing:border-box}
  html{background:#fff;color:#111827}
  body{max-width:186mm;margin:0 auto;padding:0;font-family:Cairo,Arial,sans-serif;color:#111827;line-height:1.75}
  button{margin-bottom:18px;border:1px solid #9ca3af;border-radius:8px;background:#fff;padding:8px 16px;font:inherit;cursor:pointer}
  .print-brand-header{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:3px solid #d6a700;padding-bottom:12px}
  .print-brand{display:flex;align-items:center;gap:12px}
  .print-brand-logo{display:grid;width:104px;height:62px;place-items:center;border:1px solid #111827;border-radius:9px;background:#111827!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .print-brand-logo img{display:block;width:84px;height:auto;object-fit:contain}
  .print-brand-copy{display:flex;flex-direction:column}
  .print-brand-copy strong{font-size:19px;font-weight:900}
  .print-brand-copy span{color:#4b5563;font-size:11px}
  .document-heading{margin-top:22px}
  .document-heading .eyebrow{margin:0;color:#78350f;font-size:12px;font-weight:900}
  .document-heading h1{margin:3px 0 0;font-size:25px;line-height:1.4}
  .document-subject{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:4px 14px;margin-top:16px;border:1px solid #d6a700;border-radius:10px;background:#fffbeb!important;padding:12px 14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .document-subject span{grid-row:1/3;color:#78350f;font-size:11px;font-weight:900}
  .document-subject strong{font-size:18px}
  .document-subject small{color:#4b5563;font-size:11px}
  .document-preamble{margin:18px 0 0;border-right:4px solid #d6a700;padding:8px 12px;color:#374151}
  .document-section{margin-top:18px;border:1px solid #9ca3af;border-radius:10px;padding:14px 16px}
  .document-section h2{margin:0 0 8px;color:#78350f;font-size:15px}
  .document-terms{white-space:pre-wrap;overflow-wrap:anywhere}
  .document-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}
  .document-box{border:1px solid #d1d5db;border-radius:10px;padding:12px}
  .document-box span{display:block;color:#4b5563;font-size:11px}
  .document-box strong{display:block;margin-top:4px}
  .document-signatures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:28px}
  .document-signatures div{min-height:62px;border-bottom:1px solid #111827;font-size:11px;font-weight:800}
  table{width:100%;margin-top:18px;border-collapse:collapse;table-layout:fixed}
  th{background:#111827!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  th,td{border:1px solid #d1d5db;padding:10px;text-align:right;overflow-wrap:anywhere}
  @media print{button{display:none}.print-brand-logo,th,.document-subject{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
`

export function openBrandedPrintWindow({ title, subtitle, body, extraStyles = "", windowFeatures = "noopener,noreferrer,width=900,height=900" }: BrandedPrintOptions) {
  const popup = window.open("", "_blank", windowFeatures)
  if (!popup) return false
  popup.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapePrintHtml(title)}</title><style>${baseStyles}${extraStyles}</style></head><body><button type="button" onclick="window.print()">طباعة</button><header class="print-brand-header"><div class="print-brand"><div class="print-brand-logo"><img src="/go-fitness-logo.png" alt="شعار GO Fitness"></div><div class="print-brand-copy"><strong>GO Fitness</strong><span>${escapePrintHtml(subtitle)}</span></div></div></header>${body}<script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
  return true
}

export function escapePrintHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character)
}

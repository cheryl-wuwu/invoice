import * as XLSX from 'xlsx'

// 各公司欄位對照（依 ERP 系統匯出格式）
// 主檔欄位 + 明細欄位
const M_MAP = {
  // 亞郁科技（taxId: 27284640，發票字軌 BA/BB）
  '27284640': {
    // 主檔
    invoiceNo:34, invoiceDate:33, buyerTaxId:10,
    buyerName:7,  taxableAmt:35,  taxAmt:36,
    totalAmt:43,  taxType:26,     orderNo:0, orderDate:2,
    // 明細
    d_partNo:2, d_qty:6, d_unitPrice:9, d_amount:10, d_custOrderNo:16,
  },
  // 台灣科亞（taxId: 53927205，發票字軌 BD）
  '53927205': {
    // 主檔
    invoiceNo:32, invoiceDate:31, buyerTaxId:10,
    buyerName:7,  taxableAmt:33,  taxAmt:34,
    totalAmt:41,  taxType:24,     orderNo:0, orderDate:2,
    // 明細
    d_partNo:2, d_qty:6, d_unitPrice:9, d_amount:10, d_custOrderNo:16,
  },
  // 兆一科技（taxId: 93497589，發票字軌 BP）
  '93497589': {
    // 主檔
    invoiceNo:27, invoiceDate:26, buyerTaxId:10,
    buyerName:7,  taxableAmt:28,  taxAmt:29,
    totalAmt:35,  taxType:21,     orderNo:0, orderDate:2,
    // 明細（客戶單號在 col 15，比亞郁/科亞少一欄）
    d_partNo:2, d_qty:6, d_unitPrice:9, d_amount:10, d_custOrderNo:15,
  },
}

// 根據選擇的賣方 taxId 取得欄位對照（手動選擇，不自動偵測）
export function getM(taxId) {
  return M_MAP[taxId] || M_MAP['27284640']
}

// 向後相容（預設亞郁）
const M = M_MAP['27284640']

const taxLbl = c => ({"1":"應稅","2":"零稅率","3":"免稅","4":"不課稅","5":"特種稅率"}[String(c)]||String(c)||"應稅")

export function toADDateCSV(val) {
  if (!val) return ''
  const s = String(val).trim().replace(/\D/g, '')
  let y, m, d
  if (s.length===8){ y=parseInt(s.slice(0,4)); m=s.slice(4,6); d=s.slice(6,8) }
  else if (s.length===7){ y=parseInt(s.slice(0,3))+1911; m=s.slice(3,5); d=s.slice(5,7) }
  else if (/^\d{5}$/.test(s)){
    const dt=new Date(Date.UTC(1899,11,30)+parseInt(s)*86400000)
    y=dt.getUTCFullYear(); m=String(dt.getUTCMonth()+1).padStart(2,'0'); d=String(dt.getUTCDate()).padStart(2,'0')
  } else return String(val)
  return `${y}/${m}/${d}`
}

export function parseERP(wb, taxId='27284640') {
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:''})
  const invoices=[], errors=[]
  // 根據選擇的賣方套用對應欄位對照
  const FM = getM(taxId)
  let i=0
  while (i < raw.length) {
    if (String(raw[i][0]).trim() === '單號') {
      i++
      while (i < raw.length) {
        const dr=raw[i], f0=String(dr[0]).trim()
        if (f0==='單號') break
        if (f0==='') {
          const col1=String(dr[1]??'').trim()
          if (col1==='序號'){ i++; continue }
          if (col1 && invoices.length>0) {
            const last = invoices[invoices.length-1]
            last.details.push({
              partNo:      String(dr[FM.d_partNo]      ??'').trim(),
              qty:         dr[FM.d_qty]      ??'',
              unitPrice:   dr[FM.d_unitPrice]??'',
              amount:      dr[FM.d_amount]   ??'',
              custOrderNo: String(dr[FM.d_custOrderNo] ??'').trim(),
            })
          }
          i++; continue
        }
        const inv = {
          sourceRow:i+1,
          orderNo:    String(dr[FM.orderNo]   ??'').trim(),
          invoiceNo:  String(dr[FM.invoiceNo] ??'').trim(),
          orderDate:  String(dr[FM.orderDate] ??'').trim(),
          invoiceDate:String(dr[FM.invoiceDate]??'').trim(),
          buyerTaxId: String(dr[FM.buyerTaxId]??'').trim(),
          buyerName:  String(dr[FM.buyerName] ??'').trim(),
          taxableAmt: dr[FM.taxableAmt],
          taxAmt:     dr[FM.taxAmt],
          totalAmt:   dr[FM.totalAmt],
          taxType:    taxLbl(dr[FM.taxType]),
          details:    [],
        }
        const twToday = new Date().toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\//g,'').replace(/-/g,'')
        const normInv = String(inv.invoiceDate).replace(/\D/g,'').slice(0,8)
        const normOrd = String(inv.orderDate).replace(/\D/g,'').slice(0,8)
        const errs=[]
        if (!inv.invoiceNo) errs.push('發票號碼為空')
        if (!toADDateCSV(inv.invoiceDate)||toADDateCSV(inv.invoiceDate)===String(inv.invoiceDate))
          errs.push(`發票日期「${inv.invoiceDate}」格式無法解析`)
        if (normOrd&&normInv&&normOrd!==normInv)
          errs.push(`日期（${inv.orderDate}）與發票日期（${inv.invoiceDate}）不一致`)
        if (normInv&&normInv!==twToday)
          errs.push(`發票日期（${inv.invoiceDate}）不是今天（台灣時間 ${twToday.slice(0,4)}/${twToday.slice(4,6)}/${twToday.slice(6,8)}）`)
        if (!/^\d{8}$/.test(inv.buyerTaxId)) errs.push(`買方統編「${inv.buyerTaxId}」非 8 位數字`)
        if (!inv.buyerName) errs.push('買方名稱為空')
        if (isNaN(Number(inv.totalAmt))||inv.totalAmt==='') errs.push(`本幣總計「${inv.totalAmt}」非數字`)
        inv.valid=errs.length===0; inv.errs=errs
        invoices.push(inv); i++
      }
    } else i++
  }
  if (!invoices.length) errors.push({row:'-',msgs:['找不到有效主檔資料，請確認為 ERP 匯出格式']})
  return {invoices,errors}
}

export function toCSV(invoices, tid, tn, tAddr='', tTel='') {
  const PAD=15
  const esc=c=>{const s=String(c??'');return(s.includes(',')||s.includes('"')||s.includes('\n'))?`"${s.replace(/"/g,'""')}"`  :s}
  const row=cols=>[...cols,...Array(PAD).fill('')].slice(0,PAD).map(esc).join(',')
  const fmtDate=val=>{const s=String(val??'').trim().replace(/\D/g,'');return s.length===8?`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)}`:toADDateCSV(val)}
  const lines=[]
  lines.push(row(['H',tid,tn,tAddr,tTel]))
  for (const inv of invoices.filter(v=>v.valid)) {
    const tc=inv.taxType==='應稅'?'1':inv.taxType==='零稅率'?'2':inv.taxType==='免稅'?'3':inv.taxType==='不課稅'?'4':'1'
    const tr=tc==='1'?'5':tc==='4'?'特':'0'
    const sa=inv.taxableAmt!==''?Math.round(Number(inv.taxableAmt)):''
    const ta=inv.taxAmt    !==''?Math.round(Number(inv.taxAmt))    :''
    const tt=inv.totalAmt  !==''?Math.round(Number(inv.totalAmt))  :''
    lines.push(row(['M',inv.invoiceNo,fmtDate(inv.invoiceDate),'07',inv.buyerTaxId,inv.buyerName,' ',tc,tr,sa,ta,tt]))
    const details=inv.details?.length>0?inv.details:[{partNo:'',qty:1,unitPrice:sa,amount:sa,custOrderNo:''}]
    for (const d of details) {
      lines.push(row(['D',d.partNo||'',d.qty!==''?Number(d.qty):'',d.unitPrice!==''?Number(d.unitPrice):'',d.amount!==''?Number(d.amount):'',d.custOrderNo]))
    }
  }
  return lines.join('\r\n')
}

export function downloadCSV(csvStr, filename) {
  const b64 = btoa(unescape(encodeURIComponent(csvStr)))
  const a = Object.assign(document.createElement('a'),{
    href:'data:text/csv;charset=utf-8;base64,'+b64, download:filename,
  })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

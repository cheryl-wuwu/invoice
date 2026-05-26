import { useState, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  supabase, EXCEL_BUCKET, PDF_BUCKET,
  fetchRecords, insertRecord, updateRecordStatus,
  getAndIncrementSeq, getSeq, uploadFile, downloadFileBlob,
  signOut, getSession, getUserRole
} from './supabase.js'
import LoginPage from './Auth.jsx'
import AdminPanel from './AdminPanel.jsx'
import { parseERP, toCSV, downloadCSV, toADDateCSV } from './erp.js'

// ── 常數 ───────────────────────────────────────────────────────────────────────
const SELLERS = [
  { taxId:'27284640', name:'亞郁科技股份有限公司', addr:'台北市文山區樟新街32巷11號',       tel:'02-29367996' },
  { taxId:'53927205', name:'台灣科亞有限公司',     addr:'桃園市桃園區建國里建國東路7-2號1樓', tel:'03-3670262'  },
  { taxId:'93497589', name:'兆一科技有限公司',     addr:'台北市中正區館前路34號11樓',         tel:'0920009003'  },
]
const ROLES = [
  { id:'staff',   label:'一般人員',   icon:'👤', tabs:[0,2],    canUploadTab3:false },
  { id:'finance', label:'財務人員',   icon:'💼', tabs:[0,1,2], canUploadTab3:true  },
  { id:'admin',   label:'系統管理員', icon:'🛡',  tabs:[0,1,2], canUploadTab3:true  },
]

// ── 工具 ───────────────────────────────────────────────────────────────────────
const fmtBytes = b => b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(2)+' MB'
const TW = { timeZone:'Asia/Taipei' }
const fmtTime   = ts => new Date(ts).toLocaleString('zh-TW',{...TW,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
const fmtDateTW = ts => new Date(ts).toLocaleDateString('zh-TW',{...TW,year:'numeric',month:'2-digit',day:'2-digit'})
const todayTW   = ()  => new Date().toLocaleDateString('zh-TW',{...TW,year:'numeric',month:'2-digit',day:'2-digit'})
const todayKey  = ()  => todayTW().replace(/\//g,'')
const isToday   = ts  => fmtDateTW(ts) === todayTW()
const fileIcon  = n => /\.pdf$/i.test(n)?'📄':/\.(xlsx|xls|xlsm)$/i.test(n)?'📊':/\.(jpe?g|png|gif|webp)$/i.test(n)?'🖼':'📎'

// ── 共用 UI ────────────────────────────────────────────────────────────────────
function Badge({status}){
  const m={pending:['待驗證','#1e293b','#64748b'],checking:['驗證中','#0c2a4a','#60a5fa'],
    error:['有錯誤','#2d0a0a','#f87171'],ok:['通過','#042b16','#4ade80'],
    exported:['已匯出','#1a0e3a','#c084fc'],attach:['附件','#1c1200','#fbbf24']}
  const [label,bg,color]=m[status]||m.pending
  return <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.05em',padding:'2px 9px',borderRadius:20,background:bg,color,border:`1px solid ${color}44`,whiteSpace:'nowrap',fontFamily:"'DM Mono',monospace"}}>{label}</span>
}
function Btn({children,onClick,color='#0ea5e9',bg='#0c2a4a',disabled,style={}}){
  return <button onClick={onClick} disabled={disabled} style={{background:bg,border:`1px solid ${color}`,color,borderRadius:8,padding:'5px 12px',fontSize:11,fontFamily:"'Syne',sans-serif",fontWeight:700,cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.4:1,transition:'all .15s',...style}}>{children}</button>
}
function Modal({title,accent='#0ea5e9',onClose,children,wide}){
  return(
    <div style={{position:'fixed',inset:0,zIndex:999,background:'rgba(0,0,0,.83)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#0d1525',border:`1px solid ${accent}55`,borderRadius:18,padding:'26px 30px',width:'100%',maxWidth:wide?740:600,maxHeight:'84vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,color:accent,fontSize:14}}>{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:18,lineHeight:1}}>✕</button>
        </div>
        <div style={{overflowY:'auto',flex:1,paddingRight:4}}>{children}</div>
        <button onClick={onClose} style={{marginTop:18,padding:'9px',width:'100%',background:'#1e293b',border:'1px solid #334155',color:'#94a3b8',borderRadius:10,cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>關閉</button>
      </div>
    </div>
  )
}
function NoAccess({role}){
  return(
    <div style={{textAlign:'center',padding:'80px 20px'}}>
      <div style={{fontSize:52,marginBottom:16}}>🔒</div>
      <p style={{fontWeight:800,fontSize:16,marginBottom:8}}>此功能需要特定權限</p>
      <p style={{color:'#475569',fontSize:13,fontFamily:"'DM Mono',monospace"}}>目前身份：<span style={{color:'#f87171'}}>{role.icon} {role.label}</span></p>
      <p style={{color:'#334155',fontSize:11,fontFamily:"'DM Mono',monospace",marginTop:6}}>請切換至 財務人員 / 系統管理員</p>
    </div>
  )
}
function Spinner(){
  return <span style={{display:'inline-block',animation:'spin 1s linear infinite',fontSize:16}}>⟳</span>
}
function RoleSelector({role,onChange}){
  const [open,setOpen]=useState(false)
  const colorMap={staff:'#64748b',finance:'#4ade80',admin:'#a78bfa'}
  const col=colorMap[role.id]||'#64748b'
  return(
    <div style={{position:'relative'}}>
      <button onClick={()=>setOpen(v=>!v)} style={{display:'flex',alignItems:'center',gap:9,background:'#0d1525',border:`1px solid ${col}44`,borderRadius:12,padding:'9px 15px',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,color:'#e2e8f0'}}>
        <span style={{fontSize:18}}>{role.icon}</span>
        <div style={{textAlign:'left'}}>
          <div style={{fontSize:12,color:col,fontFamily:"'DM Mono',monospace",lineHeight:1}}>身份</div>
          <div style={{fontSize:13,lineHeight:1.4}}>{role.label}</div>
        </div>
        <span style={{color:'#475569',fontSize:11,marginLeft:2}}>{open?'▲':'▼'}</span>
      </button>
      {open&&(
        <>
          <div style={{position:'fixed',inset:0,zIndex:100}} onClick={()=>setOpen(false)}/>
          <div style={{position:'absolute',top:'calc(100% + 8px)',right:0,zIndex:200,background:'#0d1525',border:'1px solid #334155',borderRadius:14,padding:6,minWidth:220,boxShadow:'0 8px 40px rgba(0,0,0,.5)'}}>
            {ROLES.map(r=>{
              const c=colorMap[r.id]||'#64748b'
              return(
                <button key={r.id} onClick={()=>{onChange(r);setOpen(false)}} style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 14px',borderRadius:9,border:'none',cursor:'pointer',background:r.id===role.id?`${c}15`:'transparent',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>
                  <span style={{fontSize:18}}>{r.icon}</span>
                  <div style={{textAlign:'left',flex:1}}>
                    <div style={{color:r.id===role.id?c:'#94a3b8'}}>{r.label}</div>
                    <div style={{fontSize:10,color:'#334155',fontFamily:"'DM Mono',monospace",fontWeight:400,marginTop:1}}>頁籤 {r.tabs.map(t=>t+1).join('·')} {r.canUploadTab3?'· 可上傳附件':''}</div>
                  </div>
                  {r.id===role.id&&<span style={{color:c,fontSize:14}}>✓</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1：上傳 & 共用紀錄
// ═══════════════════════════════════════════════════════════════════════════════
function Tab1({onAddFiles, records, loadingRecords}){
  const [drag,setDrag]=useState(false)
  const [filter,setFilter]=useState('all')
  const [uploading,setUploading]=useState(false)
  const ref=useRef()

  const filtered = records.filter(r=>{
    const ts = new Date(r.uploaded_at).getTime()
    if (filter==='today')   return isToday(ts)
    if (filter==='invoice') return r.tab_type==='tab1'
    if (filter==='attach')  return r.tab_type==='tab3'
    return true
  }).sort((a,b)=>new Date(b.uploaded_at)-new Date(a.uploaded_at))

  const todayN   = records.filter(r=>isToday(new Date(r.uploaded_at).getTime())).length
  const invoiceN = records.filter(r=>r.tab_type==='tab1').length
  const attachN  = records.filter(r=>r.tab_type==='tab3').length

  const handleFiles = async (files) => {
    setUploading(true)
    await onAddFiles(files)
    setUploading(false)
  }

  return(
    <div style={{animation:'fadeUp .3s ease'}}>
      <div
        onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);handleFiles([...e.dataTransfer.files])}}
        onClick={()=>ref.current.click()}
        style={{border:`2px dashed ${drag?'#6366f1':'#1e293b'}`,borderRadius:18,padding:'52px 24px',textAlign:'center',cursor:'pointer',background:drag?'#0d1525':'#0a1020',transition:'all .2s',marginBottom:28,opacity:uploading?0.7:1}}
      >
        {uploading?<div style={{fontSize:36,marginBottom:10}}><Spinner/></div>:<div style={{fontSize:48,marginBottom:12}}>📂</div>}
        <p style={{fontWeight:800,fontSize:16,marginBottom:6}}>{uploading?'上傳中，請稍候…':'拖曳 ERP 發票 Excel 至此，或點擊選取'}</p>
        <p style={{color:'#334155',fontSize:12,fontFamily:"'DM Mono',monospace"}}>支援 .xlsx / .xls / .xlsm　·　檔案同步儲存至雲端</p>
        <input ref={ref} type="file" multiple accept=".xlsx,.xls,.xlsm" style={{display:'none'}}
          onChange={e=>{handleFiles([...e.target.files]);e.target.value=''}}/>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        <span style={{fontWeight:800,fontSize:15}}>上傳紀錄</span>
        <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:'#4ade80',background:'#042b16',border:'1px solid #16653455',borderRadius:20,padding:'2px 10px'}}>☁ 雲端儲存・多人共用</span>
        <div style={{flex:1}}/>
        {[['all','全部',records.length,'#94a3b8'],['today','今日',todayN,'#0ea5e9'],['invoice','發票',invoiceN,'#a5b4fc'],['attach','附件',attachN,'#fbbf24']].map(([v,l,n,c])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{padding:'4px 12px',borderRadius:20,border:`1px solid ${filter===v?c:c+'33'}`,background:filter===v?c+'22':'transparent',color:filter===v?c:'#475569',cursor:'pointer',fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700}}>{l} {n}</button>
        ))}
      </div>

      {loadingRecords?(
        <div style={{textAlign:'center',padding:'48px',color:'#334155'}}>
          <Spinner/> <span style={{marginLeft:8,fontFamily:"'DM Mono',monospace",fontSize:13}}>載入紀錄中…</span>
        </div>
      ):filtered.length===0?(
        <div style={{textAlign:'center',padding:'48px 20px',color:'#1e293b',background:'#0a1020',border:'1px solid #1e293b',borderRadius:16}}>
          <div style={{fontSize:40,marginBottom:10}}>📋</div>
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:13}}>無符合條件的紀錄</p>
        </div>
      ):(
        <div style={{background:'#0a1020',border:'1px solid #1e293b',borderRadius:16,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 90px 150px 80px',padding:'9px 18px',background:'#0d1525',fontSize:10,fontFamily:"'DM Mono',monospace",color:'#334155',letterSpacing:'0.06em',borderBottom:'1px solid #1e293b',gap:8}}>
            {['','檔案名稱','大小','類型','上傳時間','狀態'].map((h,i)=><span key={i}>{h}</span>)}
          </div>
          {filtered.map((r,idx)=>{
            const ts=new Date(r.uploaded_at).getTime()
            return(
              <div key={r.id} style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 90px 150px 80px',padding:'12px 18px',alignItems:'center',gap:8,borderBottom:idx<filtered.length-1?'1px solid #0d1525':'none',background:'transparent'}}>
                <span style={{fontSize:17,textAlign:'center'}}>{r.tab_type==='tab3'?fileIcon(r.name):'🧾'}</span>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.name}>{r.name}</div>
                  {r.uploader&&<div style={{fontSize:10,color:'#334155',fontFamily:"'DM Mono',monospace"}}>{r.uploader}</div>}
                </div>
                <span style={{fontSize:11,color:'#475569',fontFamily:"'DM Mono',monospace"}}>{fmtBytes(r.size)}</span>
                <span style={{fontSize:11,color:'#475569',fontFamily:"'DM Mono',monospace"}}>{r.tab_type==='tab3'?'附件':'發票'}</span>
                <span style={{fontSize:11,color:'#475569',fontFamily:"'DM Mono',monospace"}}>{fmtTime(ts)}</span>
                <Badge status={r.tab_type==='tab3'?'attach':r.status}/>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2：驗證 & 匯出
// ═══════════════════════════════════════════════════════════════════════════════
function Tab2({records, onStatusUpdate, role, exportSeq, setExportSeq}){
  const [si,setSi]=useState(0)
  const [modal,setModal]=useState(null)
  const [localFiles,setLocalFiles]=useState({}) // id → {wb, invoices, errors, status}
  const [downloading,setDownloading]=useState(null)

  // ⚠️ 所有 hooks 必須在 early return 之前宣告
  const tid=SELLERS[si].taxId, tn=SELLERS[si].name, tAddr=SELLERS[si].addr, tTel=SELLERS[si].tel
  const invRecords=records.filter(r=>r.tab_type==='tab1')

  // 下載並解析 Excel
  const loadFile = useCallback(async (rec) => {
    if (localFiles[rec.id]?.wb) return localFiles[rec.id]
    setDownloading(rec.id)
    try {
      const blob = await downloadFileBlob(EXCEL_BUCKET, rec.storage_path)
      const buf  = await blob.arrayBuffer()
      const wb   = XLSX.read(buf, {type:'array'})
      const {invoices,errors} = parseERP(wb)
      const hasErr = errors.length>0||invoices.some(i=>!i.valid)
      const status = hasErr?'error':'ok'
      const entry = {wb,invoices,errors,status}
      setLocalFiles(p=>({...p,[rec.id]:entry}))
      await updateRecordStatus(rec.id, status)
      onStatusUpdate(rec.id, status)
      setDownloading(null)
      return entry
    } catch(e) {
      setDownloading(null)
      const entry={wb:null,invoices:[],errors:[{row:'-',msgs:['下載或解析失敗：'+e.message]}],status:'error'}
      setLocalFiles(p=>({...p,[rec.id]:entry}))
      return entry
    }
  },[localFiles,onStatusUpdate])

  const checkFile = useCallback(async (rec) => {
    onStatusUpdate(rec.id,'checking')
    await loadFile(rec)
  },[loadFile,onStatusUpdate])

  const doExportSingle = useCallback(async (rec) => {
    let entry = localFiles[rec.id]
    if (!entry?.wb) entry = await loadFile(rec)
    if (!entry?.invoices?.length) return
    const tk=todayKey()
    const next = await getAndIncrementSeq(tk)
    setExportSeq(next)
    downloadCSV(toCSV(entry.invoices,tid,tn,tAddr,tTel),`發票彙總${tk}-${next}.csv`)
    await updateRecordStatus(rec.id,'exported')
    onStatusUpdate(rec.id,'exported')
  },[localFiles,tid,tn,tAddr,tTel,setExportSeq,onStatusUpdate,loadFile])

  const doExportAll = useCallback(async () => {
    const passed = invRecords.filter(r=>r.status==='ok'||r.status==='exported')
    // 確保所有檔案都已下載
    const allEntries = await Promise.all(passed.map(r=>loadFile(r)))
    const allInvoices = allEntries.flatMap(e=>e?.invoices||[])
    const tk=todayKey()
    const next = await getAndIncrementSeq(tk)
    setExportSeq(next)
    downloadCSV(toCSV(allInvoices,tid,tn,tAddr,tTel),`發票彙總${tk}-${next}.csv`)
    for (const r of passed) {
      await updateRecordStatus(r.id,'exported')
      onStatusUpdate(r.id,'exported')
    }
  },[invRecords,tid,tn,tAddr,tTel,setExportSeq,onStatusUpdate,loadFile])

  const getStatus = (rec) => localFiles[rec.id]?.status || rec.status
  const getEntry  = (rec) => localFiles[rec.id]

  const pN  = invRecords.filter(r=>getStatus(r)==='pending').length
  const okN = invRecords.filter(r=>getStatus(r)==='ok'||getStatus(r)==='exported').length
  const eN  = invRecords.filter(r=>getStatus(r)==='error').length
  const modalRec = modal ? invRecords.find(r=>r.id===modal.fileId) : null
  const modalEntry = modalRec ? getEntry(modalRec) : null

  // early return 放在所有 hooks 之後
  if (!role.tabs.includes(1)) return <NoAccess role={role}/>

  return(
    <div style={{animation:'fadeUp .3s ease'}}>
      {/* 賣方選擇 */}
      <div style={{background:'#0a1020',border:'1px solid #164e63',borderRadius:14,padding:'14px 20px',marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          <span style={{fontSize:14}}>🏢</span>
          <span style={{fontWeight:700,fontSize:13,color:'#94a3b8',whiteSpace:'nowrap'}}>賣方</span>
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            {SELLERS.map((s,i)=>(
              <button key={i} onClick={()=>setSi(i)} style={{padding:'7px 14px',borderRadius:10,cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,transition:'all .15s',background:si===i?'#0c4a6e':'#0d1525',border:si===i?'1px solid #0ea5e9':'1px solid #1e293b',color:si===i?'#7dd3fc':'#475569'}}>
                <span style={{display:'block',fontSize:10,fontFamily:"'DM Mono',monospace",color:si===i?'#38bdf8':'#334155'}}>{s.taxId}</span>
                {s.name}{i===0&&<span style={{marginLeft:5,fontSize:9,color:'#0ea5e9',fontFamily:"'DM Mono',monospace"}}>預設</span>}
              </button>
            ))}
          </div>
        </div>
        <div style={{marginTop:10,padding:'8px 12px',background:'#070c18',border:'1px solid #1e293b',borderRadius:10,display:'flex',gap:20,flexWrap:'wrap'}}>
          <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:'#475569'}}>📍 {SELLERS[si].addr}</span>
          <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:'#475569'}}>📞 {SELLERS[si].tel}</span>
        </div>
      </div>

      <div style={{marginBottom:14,fontSize:11,fontFamily:"'DM Mono',monospace",color:'#334155'}}>
        今日匯出流水號：<span style={{color:'#0ea5e9',fontWeight:700}}>#{exportSeq}</span>　（下次匯出將為 #{exportSeq+1}）
      </div>

      {/* 統計 + 批次 */}
      {invRecords.length>0&&(
        <div style={{display:'flex',gap:9,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
          {[['待驗證',pN,'#60a5fa'],['有錯誤',eN,'#f87171'],['通過',okN,'#4ade80']].map(([l,v,c])=>(
            <div key={l} style={{background:'#0d1525',border:'1px solid #1e293b',borderRadius:12,padding:'7px 14px',display:'flex',gap:6,alignItems:'baseline'}}>
              <span style={{fontSize:20,fontWeight:800,color:c}}>{v}</span>
              <span style={{fontSize:11,color:'#334155',fontFamily:"'DM Mono',monospace"}}>{l}</span>
            </div>
          ))}
          <div style={{flex:1}}/>
          {pN>0&&<Btn onClick={()=>invRecords.filter(r=>getStatus(r)==='pending').forEach(r=>checkFile(r))} style={{padding:'8px 16px',fontSize:12}}>▶ 全部驗證 ({pN})</Btn>}
          {okN>0&&<Btn onClick={doExportAll} bg="#1a0e3a" color="#a5b4fc" style={{padding:'8px 16px',fontSize:12}}>⬇ 全部匯出成 1 個 CSV ({okN})</Btn>}
        </div>
      )}

      {/* 列表 */}
      {invRecords.length===0?(
        <div style={{textAlign:'center',padding:'60px 20px',color:'#1e293b',background:'#0a1020',border:'1px solid #1e293b',borderRadius:16}}>
          <div style={{fontSize:40,marginBottom:10}}>🔍</div>
          <p style={{fontFamily:"'DM Mono',monospace",fontSize:13}}>請先至「上傳」頁籤上傳 ERP 發票檔案</p>
        </div>
      ):(
        <div style={{background:'#0a1020',border:'1px solid #1e293b',borderRadius:16,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 76px 76px 52px 130px 1fr',padding:'9px 18px',background:'#0d1525',fontSize:10,fontFamily:"'DM Mono',monospace",color:'#334155',letterSpacing:'0.06em',borderBottom:'1px solid #1e293b',gap:8}}>
            {['檔案名稱','大小','筆數','錯誤','上傳時間','操作'].map((h,i)=><span key={i} style={{textAlign:i===5?'center':'left'}}>{h}</span>)}
          </div>
          {invRecords.map((rec,idx)=>{
            const entry   = getEntry(rec)
            const status  = getStatus(rec)
            const vN=entry?.invoices?.filter(i=>i.valid).length??0
            const iN=entry?.invoices?.length??0
            const rE=(entry?.errors?.length??0)+(entry?.invoices?.filter(i=>!i.valid).length??0)
            const isLoading=downloading===rec.id
            return(
              <div key={rec.id} style={{display:'grid',gridTemplateColumns:'1fr 76px 76px 52px 130px 1fr',padding:'13px 18px',alignItems:'center',gap:8,borderBottom:idx<invRecords.length-1?'1px solid #0d1525':'none',background:'transparent'}}>
                <div style={{display:'flex',flexDirection:'column',gap:4,minWidth:0}}>
                  <span style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={rec.name}>{rec.name}</span>
                  <Badge status={status}/>
                </div>
                <span style={{fontSize:11,color:'#475569',fontFamily:"'DM Mono',monospace"}}>{fmtBytes(rec.size)}</span>
                <span style={{fontSize:11,color:iN>0?'#e2e8f0':'#475569',fontFamily:"'DM Mono',monospace"}}>{iN>0?`${vN}/${iN}`:'—'}</span>
                <span style={{fontSize:11,color:rE>0?'#f87171':'#4ade80',fontFamily:"'DM Mono',monospace"}}>{status==='pending'?'—':rE>0?rE:'✓'}</span>
                <span style={{fontSize:10,color:'#334155',fontFamily:"'DM Mono',monospace"}}>{fmtTime(new Date(rec.uploaded_at).getTime())}</span>
                <div style={{display:'flex',gap:5,justifyContent:'center',flexWrap:'wrap'}}>
                  {isLoading&&<span style={{fontSize:11,color:'#60a5fa',fontFamily:"'DM Mono',monospace"}}><Spinner/> 載入中</span>}
                  {!isLoading&&status==='pending'&&<Btn onClick={()=>checkFile(rec)}>▶ 驗證</Btn>}
                  {!isLoading&&status==='error'&&<Btn onClick={()=>checkFile(rec)}>↺ 重試</Btn>}
                  {!isLoading&&entry?.invoices?.length>0&&<Btn onClick={()=>setModal({type:'preview',fileId:rec.id})} color="#64748b" bg="#0d1525">👁 明細</Btn>}
                  {!isLoading&&status==='error'&&rE>0&&<Btn onClick={()=>setModal({type:'errors',fileId:rec.id})} color="#f87171" bg="#2d0a0a">⚠ {rE}</Btn>}
                  {!isLoading&&(status==='ok'||status==='exported')&&<Btn onClick={()=>doExportSingle(rec)} color="#a5b4fc" bg="#1a0e3a">⬇ CSV</Btn>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 錯誤 Modal */}
      {modal?.type==='errors'&&modalEntry&&(
        <Modal title={`⚠ 驗證錯誤 — ${modalRec?.name}`} accent="#f87171" onClose={()=>setModal(null)}>
          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            {[...(modalEntry.errors||[]).map((e,i)=>({key:`g${i}`,row:e.row,inv:'',msgs:e.msgs})),
              ...(modalEntry.invoices||[]).filter(i=>!i.valid).map((v,i)=>({key:`r${i}`,row:v.sourceRow,inv:v.invoiceNo,msgs:v.errs}))
            ].map(it=>(
              <div key={it.key} style={{background:'#1a0505',border:'1px solid #7f1d1d',borderRadius:10,padding:'9px 13px'}}>
                <div style={{fontSize:11,color:'#94a3b8',fontFamily:"'DM Mono',monospace",marginBottom:4}}>第 {it.row} 列{it.inv?` · ${it.inv}`:''}</div>
                {it.msgs.map((m,j)=><div key={j} style={{fontSize:12,color:'#fca5a5'}}>· {m}</div>)}
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal?.type==='preview'&&modalEntry&&(
        <Modal title={`👁 發票明細 — ${modalRec?.name}`} accent="#0ea5e9" onClose={()=>setModal(null)} wide>
          <p style={{color:'#475569',fontSize:11,fontFamily:"'DM Mono',monospace",marginBottom:12}}>
            共 {modalEntry.invoices.length} 筆　·　<span style={{color:'#4ade80'}}>{modalEntry.invoices.filter(i=>i.valid).length} 可匯出</span>
          </p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead><tr style={{background:'#0d1525'}}>
                {['發票號碼','日期','買方名稱','統編','含稅金額','狀態'].map(h=>(
                  <th key={h} style={{padding:'7px 10px',color:'#475569',fontFamily:"'DM Mono',monospace",textAlign:'left',borderBottom:'1px solid #1e293b',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {modalEntry.invoices.map((v,i)=>(
                  <tr key={i} style={{background:i%2?'#0a1020':'#0d1525'}}>
                    <td style={{padding:'6px 10px',color:'#e2e8f0',fontFamily:"'DM Mono',monospace"}}>{v.invoiceNo||'—'}</td>
                    <td style={{padding:'6px 10px',color:'#94a3b8',fontFamily:"'DM Mono',monospace"}}>{toADDateCSV(v.invoiceDate)}</td>
                    <td style={{padding:'6px 10px',color:'#94a3b8',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.buyerName||'—'}</td>
                    <td style={{padding:'6px 10px',color:'#94a3b8',fontFamily:"'DM Mono',monospace"}}>{v.buyerTaxId||'—'}</td>
                    <td style={{padding:'6px 10px',color:'#4ade80',fontFamily:"'DM Mono',monospace",textAlign:'right'}}>{v.totalAmt!==''?Number(v.totalAmt).toLocaleString():'—'}</td>
                    <td style={{padding:'6px 10px'}}><Badge status={v.valid?'ok':'error'}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3：附件管理
// ═══════════════════════════════════════════════════════════════════════════════
function Tab3({records, onAddFiles, role}){
  const [drag,setDrag]=useState(false)
  const [uploading,setUploading]=useState(false)
  const [downloading,setDownloading]=useState(null)
  const ref=useRef()
  const canUp=role.canUploadTab3
  const t3=records.filter(r=>r.tab_type==='tab3').sort((a,b)=>new Date(b.uploaded_at)-new Date(a.uploaded_at))

  const handleFiles = async (files) => {
    setUploading(true)
    await onAddFiles(files)
    setUploading(false)
  }

  const dlFile = async (rec) => {
    setDownloading(rec.id)
    try {
      const blob = await downloadFileBlob(PDF_BUCKET, rec.storage_path)
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'),{href:url,download:rec.name})
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch(e) { alert('下載失敗：'+e.message) }
    setDownloading(null)
  }

  return(
    <div style={{animation:'fadeUp .3s ease'}}>
      <div style={{marginBottom:32}}>
        <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:14}}>
          <span style={{fontWeight:800,fontSize:15}}>📤 附件上傳</span>
          <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:canUp?'#fbbf24':'#f87171',background:canUp?'#1c1200':'#2d0a0a',border:`1px solid ${canUp?'#fbbf2444':'#7f1d1d44'}`,borderRadius:20,padding:'2px 10px'}}>{canUp?'✓ 有上傳權限':'🔒 無上傳權限（'+role.label+'）'}</span>
        </div>
        {canUp?(
          <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);handleFiles([...e.dataTransfer.files])}}
            onClick={()=>ref.current.click()}
            style={{border:`2px dashed ${drag?'#f59e0b':'#1e293b'}`,borderRadius:16,padding:'40px 24px',textAlign:'center',cursor:'pointer',background:drag?'#1a1200':'#0a1020',transition:'all .2s',opacity:uploading?0.7:1}}>
            {uploading?<div style={{fontSize:32,marginBottom:10}}><Spinner/></div>:<div style={{fontSize:40,marginBottom:10}}>📎</div>}
            <p style={{fontWeight:700,fontSize:14,marginBottom:5}}>{uploading?'上傳中…':'拖曳附件至此，或點擊選取'}</p>
            <p style={{color:'#334155',fontSize:12,fontFamily:"'DM Mono',monospace"}}>支援 PDF、圖片及其他格式　·　檔案儲存至雲端</p>
            <input ref={ref} type="file" multiple style={{display:'none'}} onChange={e=>{handleFiles([...e.target.files]);e.target.value=''}}/>
          </div>
        ):(
          <div style={{background:'#0a1020',border:'1px dashed #1e293b',borderRadius:16,padding:'40px 24px',textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:10,opacity:.25}}>🔒</div>
            <p style={{color:'#334155',fontSize:13,fontFamily:"'DM Mono',monospace"}}>目前身份（{role.icon} {role.label}）無法上傳附件</p>
          </div>
        )}
      </div>
      <div>
        <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:14,flexWrap:'wrap'}}>
          <span style={{fontWeight:800,fontSize:15}}>⬇ 附件下載</span>
          <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:'#4ade80',background:'#042b16',border:'1px solid #16653455',borderRadius:20,padding:'2px 10px'}}>✓ 無需權限</span>
          <span style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:'#fbbf24',background:'#1c1200',border:'1px solid #fbbf2433',borderRadius:20,padding:'2px 10px'}}>{t3.length} 個附件</span>
        </div>
        {t3.length===0?(
          <div style={{textAlign:'center',padding:'52px 20px',color:'#1e293b',background:'#0a1020',border:'1px solid #1e293b',borderRadius:16}}>
            <div style={{fontSize:40,marginBottom:10}}>📂</div>
            <p style={{fontFamily:"'DM Mono',monospace",fontSize:13}}>尚無可下載的附件</p>
          </div>
        ):(
          <div style={{background:'#0a1020',border:'1px solid #1e293b',borderRadius:16,overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 150px 90px',padding:'9px 18px',background:'#0d1525',fontSize:10,fontFamily:"'DM Mono',monospace",color:'#334155',letterSpacing:'0.06em',borderBottom:'1px solid #1e293b',gap:8}}>
              {['','檔案名稱','大小','上傳時間','操作'].map((h,i)=><span key={i} style={{textAlign:i===4?'center':'left'}}>{h}</span>)}
            </div>
            {t3.map((rec,idx)=>(
              <div key={rec.id} style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 150px 90px',padding:'12px 18px',alignItems:'center',gap:8,borderBottom:idx<t3.length-1?'1px solid #0d1525':'none',background:'transparent'}}>
                <span style={{fontSize:17,textAlign:'center'}}>{fileIcon(rec.name)}</span>
                <span style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={rec.name}>{rec.name}</span>
                <span style={{fontSize:11,color:'#475569',fontFamily:"'DM Mono',monospace"}}>{fmtBytes(rec.size)}</span>
                <span style={{fontSize:11,color:'#475569',fontFamily:"'DM Mono',monospace"}}>{fmtTime(new Date(rec.uploaded_at).getTime())}</span>
                <div style={{display:'flex',justifyContent:'center'}}>
                  {downloading===rec.id
                    ? <span style={{fontSize:11,color:'#60a5fa',fontFamily:"'DM Mono',monospace"}}><Spinner/></span>
                    : <Btn onClick={()=>dlFile(rec)} color="#4ade80" bg="#042b16">⬇ 下載</Btn>
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 根元件
// ═══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [session,setSession]     = useState(undefined)  // undefined=loading, null=未登入
  const [role,setRole]           = useState(ROLES[0])
  const [tab,setTab]             = useState(0)
  const [records,setRecords]     = useState([])
  const [loadingRecords,setLoadingRecords] = useState(true)
  const [exportSeq,setExportSeq] = useState(0)
  const [showAdmin,setShowAdmin] = useState(false)

  // 監聽 Auth 狀態
  useEffect(()=>{
    // 先讀取現有 session（處理重新整理後的狀態）
    getSession().then(async sess => {
      setSession(sess)   // null = 未登入，物件 = 已登入
      if (sess?.user?.email) {
        const r = await getUserRole(sess.user.email)
        setRole(ROLES.find(x=>x.id===r) || ROLES[0])
      }
    })
    // 監聽後續登入/登出事件
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess)
      if (sess?.user?.email) {
        const r = await getUserRole(sess.user.email)
        setRole(ROLES.find(x=>x.id===r) || ROLES[0])
      } else {
        setRole(ROLES[0])
      }
    })
    return () => subscription.unsubscribe()
  },[])

  // 初始化：載入紀錄 + 流水號（登入後才載入）
  useEffect(()=>{
    if (!session) return
    ;(async()=>{
      setLoadingRecords(true)
      try {
        const [recs, seq] = await Promise.all([fetchRecords(), getSeq(todayKey())])
        setRecords(recs)
        setExportSeq(seq)
      } catch(e){ console.error(e) }
      setLoadingRecords(false)
    })()
  },[session])

  // 每 30 秒 poll 新紀錄（多人同步）
  useEffect(()=>{
    if (!session) return
    const t = setInterval(async()=>{
      try {
        const recs = await fetchRecords()
        setRecords(recs)
      } catch{}
    }, 30000)
    return ()=>clearInterval(t)
  },[session])

  // 未登入 → 顯示登入頁
  if (session === undefined) return (
    <div style={{minHeight:'100vh',background:'#060b16',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <span style={{color:'#334155',fontFamily:"'DM Mono',monospace",fontSize:13}}>⟳ 載入中…</span>
    </div>
  )
  if (!session) return <LoginPage/>

  // Tab1 上傳 Excel
  const addTab1Files = useCallback(async (files) => {
    for (const f of files) {
      if (!f.name.match(/\.(xlsx|xls|xlsm)$/i)) continue
      const id = `t1-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const path = `${todayKey()}/${id}_${f.name}`
      try {
        await uploadFile(EXCEL_BUCKET, path, f)
        const rec = { id, name:f.name, size:f.size, uploaded_at:new Date().toISOString(), tab_type:'tab1', status:'pending', storage_path:path, uploader:role.label }
        await insertRecord(rec)
        setRecords(p=>[rec,...p])
      } catch(e){ alert('上傳失敗：'+e.message) }
    }
  },[role])

  // Tab3 上傳附件
  const addTab3Files = useCallback(async (files) => {
    for (const f of files) {
      const id = `t3-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const path = `${todayKey()}/${id}_${f.name}`
      try {
        await uploadFile(PDF_BUCKET, path, f)
        const rec = { id, name:f.name, size:f.size, uploaded_at:new Date().toISOString(), tab_type:'tab3', status:'attach', storage_path:path, uploader:role.label }
        await insertRecord(rec)
        setRecords(p=>[rec,...p])
      } catch(e){ alert('上傳失敗：'+e.message) }
    }
  },[role])

  const handleStatusUpdate = useCallback((id, status) => {
    setRecords(p=>p.map(r=>r.id===id?{...r,status}:r))
  },[])

  // 角色由 Google 登入後自動從資料庫讀取，不再手動選擇

  const TABS=[
    {label:'上傳',icon:'📤'},
    {label:'驗證 & 匯出',icon:'✅',locked:!role.tabs.includes(1)},
    {label:'附件管理',icon:'📎'},
  ]

  const todayN = records.filter(r=>isToday(new Date(r.uploaded_at).getTime())).length

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#060b16;color:#e2e8f0}
        ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:#0d1525}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:3px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{minHeight:'100vh',background:'#060b16',fontFamily:"'Syne',sans-serif",color:'#e2e8f0',padding:'30px 22px 60px'}}>
        <div style={{maxWidth:1040,margin:'0 auto'}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:26,flexWrap:'wrap'}}>
            <div style={{width:46,height:46,borderRadius:14,fontSize:24,background:'linear-gradient(135deg,#0284c7,#6366f1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>🧾</div>
            <div>
              <h1 style={{fontSize:24,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1}}>電子發票轉檔平台</h1>
              <p style={{color:'#334155',fontSize:11,fontFamily:"'DM Mono',monospace",marginTop:3}}>ERP 銷貨單 Excel → 財政部申報 CSV　·　☁ Supabase 雲端儲存</p>
            </div>
            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:10,color:'#334155',fontFamily:"'DM Mono',monospace"}}>{todayTW()} 台灣時間</div>
                <div style={{fontSize:12,fontWeight:700,color:'#4ade80',fontFamily:"'DM Mono',monospace"}}>今日 {todayN} 筆 {loadingRecords&&<Spinner/>}</div>
              </div>
              {/* 使用者資訊 */}
              <div style={{background:'#0d1525',border:'1px solid #1e293b',borderRadius:12,padding:'8px 14px',display:'flex',alignItems:'center',gap:10}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:'#e2e8f0'}}>{session?.user?.user_metadata?.name||session?.user?.email?.split('@')[0]}</div>
                  <div style={{fontSize:10,color:'#475569',fontFamily:"'DM Mono',monospace"}}>{session?.user?.email}</div>
                </div>
                <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,
                  background:role.id==='admin'?'#1a0e3a':role.id==='finance'?'#042b16':'#1e293b',
                  color:role.id==='admin'?'#a78bfa':role.id==='finance'?'#4ade80':'#64748b',
                  border:`1px solid ${role.id==='admin'?'#a78bfa44':role.id==='finance'?'#4ade8044':'#33415544'}`,
                  fontFamily:"'DM Mono',monospace",
                }}>{role.icon} {role.label}</span>
              </div>
              {/* 管理員按鈕 */}
              {role.id==='admin'&&(
                <button onClick={()=>setShowAdmin(true)} style={{background:'#1a0e3a',border:'1px solid #6366f1',color:'#a5b4fc',borderRadius:10,padding:'8px 14px',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12}}>
                  🛡 權限管理
                </button>
              )}
              {/* 登出 */}
              <button onClick={signOut} style={{background:'#0d1525',border:'1px solid #334155',color:'#64748b',borderRadius:10,padding:'8px 14px',cursor:'pointer',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,transition:'all .15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='#f87171';e.currentTarget.style.color='#f87171'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='#334155';e.currentTarget.style.color='#64748b'}}>
                登出
              </button>
            </div>
          </div>
          {/* 管理員面板 */}
          {showAdmin&&<AdminPanel onClose={()=>setShowAdmin(false)}/>}
          {/* Tabs */}
          <div style={{display:'flex',gap:3,marginBottom:24,background:'#0a1020',border:'1px solid #1e293b',borderRadius:14,padding:5}}>
            {TABS.map((t,i)=>{
              const active=tab===i,locked=t.locked
              return(
                <button key={i} onClick={()=>{if(!locked)setTab(i)}} style={{flex:1,padding:'11px 8px',borderRadius:10,border:'none',cursor:locked?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .2s',background:active?'linear-gradient(135deg,#0c2a4a,#1a0e3a)':'transparent',opacity:locked?0.38:1}}>
                  <span style={{fontSize:16}}>{t.icon}</span>
                  <span style={{fontSize:13,fontWeight:700,color:active?'#e2e8f0':locked?'#334155':'#475569',whiteSpace:'nowrap'}}>{t.label}</span>
                  {i===0&&records.filter(r=>r.tab_type==='tab1').length>0&&<span style={{fontSize:10,color:'#0ea5e9',fontFamily:"'DM Mono',monospace",background:'#0c2a4a',border:'1px solid #0ea5e933',borderRadius:20,padding:'1px 7px'}}>{records.filter(r=>r.tab_type==='tab1').length}</span>}
                  {i===2&&records.filter(r=>r.tab_type==='tab3').length>0&&<span style={{fontSize:10,color:'#fbbf24',fontFamily:"'DM Mono',monospace",background:'#1c1200',border:'1px solid #fbbf2433',borderRadius:20,padding:'1px 7px'}}>{records.filter(r=>r.tab_type==='tab3').length}</span>}
                  {locked&&<span style={{fontSize:12}}>🔒</span>}
                </button>
              )
            })}
          </div>
          {/* Content */}
          {tab===0&&<Tab1 onAddFiles={addTab1Files} records={records} loadingRecords={loadingRecords}/>}
          {tab===1&&<Tab2 records={records} onStatusUpdate={handleStatusUpdate} role={role} exportSeq={exportSeq} setExportSeq={setExportSeq}/>}
          {tab===2&&<Tab3 records={records} onAddFiles={addTab3Files} role={role}/>}
        </div>
      </div>
    </>
  )
}

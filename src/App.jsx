import { useState, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  supabase, EXCEL_BUCKET, PDF_BUCKET,
  fetchRecords, insertRecord, updateRecordStatus,
  getAndIncrementSeq, getSeq, uploadFile, downloadFileBlob,
  signOut, getSession, getUserRole, deleteRecord
} from './supabase.js'
import { parseERP, toCSV, downloadCSV, toADDateCSV, getM } from './erp.js'
import LoginPage from './Auth.jsx'
import AdminPanel from './AdminPanel.jsx'

// ── 設計系統 ──────────────────────────────────────────────────────────────────
// 柔和淺藍 × 淺棕木紋 × 乾淨白底 × 簡約高級
const C = {
  // 背景層次
  bg:        '#F7F5F2',   // 溫暖米白底
  bgWarm:    '#F0EDE8',   // 淺棕木紋底
  bgPanel:   '#FFFFFF',   // 純白卡片
  bgHover:   '#F4F1EC',   // hover 狀態
  // 木紋棕
  wood:      '#C4A882',   // 主木紋棕
  woodLight: '#E8DDD0',   // 淺木紋
  woodDark:  '#9B7D5A',   // 深木紋
  // 藍色系
  blue:      '#5B9BD5',   // 主藍
  blueLight: '#D6E8F5',   // 淺藍背景
  blueMid:   '#A8CBE8',   // 中藍
  blueDark:  '#2F6FA8',   // 深藍
  // 文字
  text:      '#3D3530',   // 主文字（暖棕黑）
  textSub:   '#8C7B6B',   // 次要文字
  textMuted: '#B8AA9E',   // 淡灰文字
  // 邊框
  border:    '#E0D5C8',   // 主邊框
  borderLight:'#EDE8E1',  // 淡邊框
  // 狀態色（柔化版）
  green:     '#6BA58A',
  greenBg:   '#EAF4EF',
  red:       '#C97B6E',
  redBg:     '#FAF0EE',
  amber:     '#C4974A',
  amberBg:   '#FAF3E6',
  purple:    '#8B7EC8',
  purpleBg:  '#F0EDF8',
}

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

// Storage 路徑只允許 ASCII，把中文/特殊字元替換成底線，保留副檔名
function sanitizeFilename(name) {
  const ext = name.match(/\.[^.]+$/)?.[0] || ''
  const base = name.slice(0, name.length - ext.length)
  const safe = base.replace(/[^\w\-]/g, '_')  // 只保留英數、底線、連字號
  return safe + ext
}
const TW = { timeZone:'Asia/Taipei' }
const fmtTime   = ts => new Date(ts).toLocaleString('zh-TW',{...TW,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
const fmtDateTW = ts => new Date(ts).toLocaleDateString('zh-TW',{...TW,year:'numeric',month:'2-digit',day:'2-digit'})
const todayTW   = ()  => new Date().toLocaleDateString('zh-TW',{...TW,year:'numeric',month:'2-digit',day:'2-digit'})
const todayKey  = ()  => todayTW().replace(/\//g,'')
const isToday   = ts  => fmtDateTW(ts) === todayTW()
const fileIcon  = n => /\.pdf$/i.test(n)?'📄':/\.(xlsx|xls|xlsm)$/i.test(n)?'📊':/\.(jpe?g|png|gif|webp)$/i.test(n)?'🖼':'📎'

// ── 共用 UI ────────────────────────────────────────────────────────────────────
function Badge({status}){
  const m={
    pending: ['待驗證', C.bgHover,    C.textMuted],
    checking:['驗證中', C.blueLight,  C.blue],
    error:   ['有錯誤', C.redBg,      C.red],
    ok:      ['通過',   C.greenBg,    C.green],
    exported:['已匯出', C.purpleBg,   C.purple],
    attach:  ['附件',   C.amberBg,    C.amber],
  }
  const [label,bg,color]=m[status]||m.pending
  return <span style={{fontSize:10,fontWeight:600,letterSpacing:'0.04em',padding:'3px 10px',borderRadius:20,background:bg,color,border:`1px solid ${color}33`,whiteSpace:'nowrap',fontFamily:"'Outfit',sans-serif"}}>{label}</span>
}

function Btn({children,onClick,variant='primary',disabled,style={}}){
  const variants={
    primary: {bg:C.blue,      color:'#fff',     border:C.blue},
    ghost:   {bg:'transparent',color:C.textSub,  border:C.border},
    danger:  {bg:C.redBg,     color:C.red,       border:C.red+'55'},
    success: {bg:C.greenBg,   color:C.green,     border:C.green+'55'},
    purple:  {bg:C.purpleBg,  color:C.purple,    border:C.purple+'55'},
    wood:    {bg:C.woodLight,  color:C.woodDark,  border:C.wood+'66'},
  }
  const v=variants[variant]||variants.primary
  return <button onClick={onClick} disabled={disabled} style={{
    background:v.bg, border:`1px solid ${v.border}`, color:v.color,
    borderRadius:8, padding:'6px 14px', fontSize:12,
    fontFamily:"'Outfit',sans-serif", fontWeight:600,
    cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.45:1,
    transition:'all .15s', boxShadow:'0 1px 3px rgba(0,0,0,.06)',
    ...style
  }}
    onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.filter='brightness(0.94)' }}
    onMouseLeave={e=>{ e.currentTarget.style.filter='' }}
  >{children}</button>
}

function Card({children, style={}}){
  return <div style={{background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:14,overflow:'hidden',boxShadow:'0 2px 8px rgba(61,53,48,.06)',...style}}>{children}</div>
}

function Modal({title,onClose,children,wide,accentColor=C.blue}){
  return(
    <div style={{position:'fixed',inset:0,zIndex:999,background:'rgba(61,53,48,.45)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:18,padding:'28px 32px',width:'100%',maxWidth:wide?740:600,maxHeight:'84vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(61,53,48,.15)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <span style={{fontFamily:"'Playfair Display',serif",fontWeight:700,color:C.text,fontSize:16}}>{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',fontSize:20,lineHeight:1,padding:'2px 6px',borderRadius:6,transition:'background .15s'}}
            onMouseEnter={e=>e.currentTarget.style.background=C.bgHover}
            onMouseLeave={e=>e.currentTarget.style.background='none'}>✕</button>
        </div>
        <div style={{overflowY:'auto',flex:1,paddingRight:4}}>{children}</div>
        <button onClick={onClose} style={{marginTop:20,padding:'10px',width:'100%',background:C.bg,border:`1px solid ${C.border}`,color:C.textSub,borderRadius:10,cursor:'pointer',fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:13,transition:'background .15s'}}
          onMouseEnter={e=>e.currentTarget.style.background=C.bgHover}
          onMouseLeave={e=>e.currentTarget.style.background=C.bg}>關閉</button>
      </div>
    </div>
  )
}

function NoAccess({role}){
  return(
    <div style={{textAlign:'center',padding:'80px 20px'}}>
      <div style={{fontSize:52,marginBottom:16,opacity:0.4}}>🔒</div>
      <p style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:18,marginBottom:8,color:C.text}}>此功能需要特定權限</p>
      <p style={{color:C.textSub,fontSize:13,fontFamily:"'Outfit',sans-serif"}}>目前身份：{role.icon} {role.label}</p>
      <p style={{color:C.textMuted,fontSize:12,marginTop:6}}>請切換至 財務人員 / 系統管理員</p>
    </div>
  )
}

function Spinner(){
  return <span style={{display:'inline-block',animation:'spin 1s linear infinite',color:C.blue}}>⟳</span>
}

function Divider(){return null}

// ── 角色徽章 ──────────────────────────────────────────────────────────────────
function RoleBadge({role}){
  const m={staff:[C.bgHover,C.textSub],finance:[C.greenBg,C.green],admin:[C.blueLight,C.blueDark]}
  const [bg,color]=m[role.id]||m.staff
  return(
    <div style={{background:bg,border:`1px solid ${color}33`,borderRadius:10,padding:'7px 12px',display:'flex',alignItems:'center',gap:7}}>
      <span style={{fontSize:15}}>{role.icon}</span>
      <div>
        <div style={{fontSize:9,color,fontFamily:"'Outfit',sans-serif",fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',lineHeight:1}}>身份</div>
        <div style={{fontSize:12,fontWeight:700,color:C.text,lineHeight:1.4,fontFamily:"'Outfit',sans-serif"}}>{role.label}</div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1：上傳 & 紀錄
// ═══════════════════════════════════════════════════════════════════════════════
function Tab1({onAddFiles,records,loadingRecords,onDeleteFile,currentUserName}){
  const [drag,setDrag]=useState(false)
  const [filter,setFilter]=useState('invoice') // 預設只顯示當天發票
  const [sortBy,setSortBy]=useState('time_desc') // time_desc / time_asc / name_asc / size_desc
  const [uploading,setUploading]=useState(false)
  const ref=useRef()

  // 固定只顯示當天
  const todayRecords=records.filter(r=>isToday(new Date(r.uploaded_at).getTime()))
  const filtered=todayRecords.filter(r=>{
    if(filter==='invoice') return r.tab_type==='tab1'
    if(filter==='attach')  return r.tab_type==='tab3'
    return true
  }).sort((a,b)=>{
    if(sortBy==='time_desc') return new Date(b.uploaded_at)-new Date(a.uploaded_at)
    if(sortBy==='time_asc')  return new Date(a.uploaded_at)-new Date(b.uploaded_at)
    if(sortBy==='name_asc')  return a.name.localeCompare(b.name,'zh-TW')
    if(sortBy==='size_desc') return b.size-a.size
    return 0
  })
  const todayN=todayRecords.length
  const invoiceN=todayRecords.filter(r=>r.tab_type==='tab1').length
  const attachN=todayRecords.filter(r=>r.tab_type==='tab3').length
  const handleFiles=async files=>{setUploading(true);await onAddFiles(files);setUploading(false)}

  return(
    <div style={{animation:'fadeUp .3s ease'}}>
      {/* 上傳區 */}
      <div
        onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);handleFiles([...e.dataTransfer.files])}}
        onClick={()=>ref.current.click()}
        style={{
          border:`2px dashed ${drag?C.blue:C.wood}`,
          borderRadius:16, padding:'48px 24px', textAlign:'center', cursor:'pointer',
          background:drag?C.blueLight:C.bgWarm,
          transition:'all .2s', marginBottom:28, opacity:uploading?0.7:1,

        }}>
        {uploading
          ? <div style={{fontSize:36,marginBottom:10,color:C.blue}}><Spinner/></div>
          : <div style={{fontSize:44,marginBottom:12}}>📂</div>}
        <p style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:18,marginBottom:6,color:C.text}}>
          {uploading?'上傳中，請稍候…':'拖曳 ERP 發票 Excel 至此，或點擊選取'}
        </p>
        <p style={{color:C.textSub,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>
          　支援 .xlsx / .xls　☁ 自動同步雲端
        </p>
        <input ref={ref} type="file" multiple accept=".xlsx,.xls," style={{display:'none'}}
          onChange={e=>{handleFiles([...e.target.files]);e.target.value=''}}/>
      </div>

      {/* 篩選列 */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        <span style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:16,color:C.text}}>今日上傳紀錄</span>
        <span style={{fontSize:10,fontFamily:"'Outfit',sans-serif",color:C.green,background:C.greenBg,border:`1px solid ${C.green}33`,borderRadius:20,padding:'2px 9px',fontWeight:600}}>☁ 雲端・多人共用</span>
        <span style={{fontSize:10,color:C.textMuted,fontFamily:"'Outfit',sans-serif"}}>{todayTW()}</span>
        <div style={{flex:1}}/>
        {/* 類型篩選 */}
        {[['all','全部',todayN,C.textSub],['invoice','發票',invoiceN,C.blue],['attach','附件',attachN,C.amber]].map(([v,l,n,c])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{
            padding:'5px 13px',borderRadius:20,cursor:'pointer',
            fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:600,transition:'all .15s',
            border:`1px solid ${filter===v?c:C.border}`,
            background:filter===v?c+'18':C.bgPanel,
            color:filter===v?c:C.textSub,
          }}>{l} {n}</button>
        ))}
        {/* 排序 */}
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{
          background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:20,
          color:C.textSub,padding:'5px 12px',fontFamily:"'Outfit',sans-serif",
          fontSize:11,fontWeight:600,cursor:'pointer',outline:'none',
        }}>
          <option value="time_desc">⬇ 時間（新→舊）</option>
          <option value="time_asc">⬆ 時間（舊→新）</option>
          <option value="name_asc">🔤 檔名 A→Z</option>
          <option value="size_desc">📦 大小（大→小）</option>
        </select>
      </div>

      {/* 列表 */}
      {loadingRecords?(
        <div style={{textAlign:'center',padding:'48px',color:C.textMuted,fontFamily:"'Outfit',sans-serif",fontSize:13}}><Spinner/> 載入中…</div>
      ):filtered.length===0?(
        <Card style={{textAlign:'center',padding:'52px 20px'}}>
          <div style={{fontSize:40,marginBottom:10,opacity:.3}}>📋</div>
          <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:C.textMuted}}>無符合條件的紀錄</p>
        </Card>
      ):(
        <Card>
          <div style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 80px 140px 80px',padding:'10px 18px',background:C.bgWarm,fontSize:10,fontFamily:"'Outfit',sans-serif",color:C.textMuted,letterSpacing:'0.07em',fontWeight:600,textTransform:'uppercase',gap:8,borderBottom:`1px solid ${C.border}`}}>
            {['','檔案名稱','大小','類型','上傳時間','狀態'].map((h,i)=><span key={i}>{h}</span>)}
          </div>
          {filtered.map((r,idx)=>{
            const ts=new Date(r.uploaded_at).getTime()
            const isOwner = r.uploader === currentUserName //////////////////
            const canDelete = isOwner && r.status === 'pending' //////////////////////////
            return(
              <div key={r.id} style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 80px 140px 80px',padding:'13px 18px',alignItems:'center',gap:8,borderBottom:idx<filtered.length-1?`1px solid ${C.borderLight}`:'none',transition:'background .12s'}}
                onMouseEnter={e=>e.currentTarget.style.background=C.bgHover}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{fontSize:17,textAlign:'center'}}>{r.tab_type==='tab3'?fileIcon(r.name):'🧾'}</span>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:C.text}} title={r.name}>{r.name}</div>
                  {r.uploader&&<div style={{fontSize:10,color:C.textMuted,fontFamily:"'Outfit',sans-serif",marginTop:1}}>{r.uploader}</div>}
                </div>
                <span style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',monospace"}}>{fmtBytes(r.size)}</span>
                <span style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',sans-serif"}}>{r.tab_type==='tab3'?'附件':'發票'}</span>
                <span style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',monospace"}}>{fmtTime(ts)}</span>
                <div style={{display:'flex',justifyContent:'center'}}> ////////////////////
                  {canDelete && (
                    <Btn 
                      onClick={() => onDeleteFile(r)} 
                      variant="danger" 
                      style={{padding:'5px 10px',fontSize:11}}
                    >
                      🗑 刪除
                    </Btn>
                  )}
                  {!canDelete && <Badge status={r.tab_type==='tab3'?'attach':r.status}/>}
                </div> ///////////////////////
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2：驗證 & 匯出
// ═══════════════════════════════════════════════════════════════════════════════
function Tab2({records,onStatusUpdate,role,exportSeq,setExportSeq}){
  const [si,setSi]           = useState(0)
  const [modal,setModal]     = useState(null)
  const [localFiles,setLocal]= useState({})
  const [dlLoading,setDlLoad]= useState(null)
  const [selected,setSelected]= useState(new Set()) // 勾選的 rec.id
  const [batchLoading,setBatch]= useState(false)

  // 只顯示當天
  const invRecords = records.filter(r=>r.tab_type==='tab1' && isToday(new Date(r.uploaded_at).getTime()))
  const getEntry   = rec => localFiles[rec.id]
  const getStatus  = rec => localFiles[rec.id]?.status || rec.status

  const loadFile = useCallback(async (rec, taxId) => {
    const cached = localFiles[rec.id]
    if(cached?.wb && cached?.taxId === taxId) return cached
    setDlLoad(rec.id)
    try{
      const blob=await downloadFileBlob(EXCEL_BUCKET,rec.storage_path)
      const buf=await blob.arrayBuffer()
      const wb=XLSX.read(buf,{type:'array'})
      const {invoices,errors}=parseERP(wb, taxId)
      const hasErr=errors.length>0||invoices.some(i=>!i.valid)
      const status=hasErr?'error':'ok'
      const entry={wb,invoices,errors,status,taxId}
      setLocal(p=>({...p,[rec.id]:entry}))
      await updateRecordStatus(rec.id,status)
      onStatusUpdate(rec.id,status)
      setDlLoad(null)
      return entry
    }catch(e){
      setDlLoad(null)
      const entry={wb:null,invoices:[],errors:[{row:'-',msgs:['下載或解析失敗：'+e.message]}],status:'error',taxId}
      setLocal(p=>({...p,[rec.id]:entry}))
      return entry
    }
  },[localFiles,onStatusUpdate])

  const checkFile=useCallback(async (rec, taxId)=>{
    onStatusUpdate(rec.id,'checking')
    await loadFile(rec, taxId)
  },[loadFile,onStatusUpdate])

  const doExportSingle=useCallback(async rec=>{
    const {taxId:tid,name:tn,addr:tAddr,tel:tTel}=SELLERS[si]
    let entry=localFiles[rec.id]
    if(!entry?.wb) entry=await loadFile(rec, tid)
    if(!entry?.invoices?.length) return
    const tk=todayKey()
    const next=await getAndIncrementSeq(tk)
    setExportSeq(next)
    downloadCSV(toCSV(entry.invoices,tid,tn,tAddr,tTel),`發票彙總${tk}-${next}.csv`)
    await updateRecordStatus(rec.id,'exported')
    onStatusUpdate(rec.id,'exported')
  },[localFiles,si,setExportSeq,onStatusUpdate,loadFile])

  // 勾選全部驗證
  const doVerifySelected = useCallback(async () => {
    if(selected.size===0) return
    const {taxId:tid}=SELLERS[si]
    setBatch(true)
    const toVerify = invRecords.filter(r=>selected.has(r.id))
    for(const rec of toVerify){
      await checkFile(rec, tid)
    }
    setBatch(false)
  },[selected,invRecords,si,checkFile])

  // 勾選全部匯出（合併成一個 CSV）
  const doExportSelected = useCallback(async () => {
    if(selected.size===0) return
    const {taxId:tid,name:tn,addr:tAddr,tel:tTel}=SELLERS[si]
    setBatch(true)
    const toExport = invRecords.filter(r=>selected.has(r.id) && (getStatus(r)==='ok'||getStatus(r)==='exported'))
    if(toExport.length===0){ setBatch(false); return }
    const allEntries = await Promise.all(toExport.map(r=>loadFile(r,tid)))
    const allInvoices = allEntries.flatMap(e=>e?.invoices||[])
    const tk=todayKey()
    const next=await getAndIncrementSeq(tk)
    setExportSeq(next)
    downloadCSV(toCSV(allInvoices,tid,tn,tAddr,tTel),`發票彙總${tk}-${next}.csv`)
    for(const r of toExport){await updateRecordStatus(r.id,'exported');onStatusUpdate(r.id,'exported')}
    setBatch(false)
  },[selected,invRecords,si,setExportSeq,onStatusUpdate,loadFile])

  // 全選/取消
  const toggleAll = () => {
    if(selected.size===invRecords.length) setSelected(new Set())
    else setSelected(new Set(invRecords.map(r=>r.id)))
  }
  const toggleOne = (id) => {
    setSelected(p=>{const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n})
  }

  const selectedRecs  = invRecords.filter(r=>selected.has(r.id))
  const canVerify     = selectedRecs.some(r=>getStatus(r)==='pending'||getStatus(r)==='error')
  const canExport     = selectedRecs.some(r=>getStatus(r)==='ok'||getStatus(r)==='exported')
  const pN  = invRecords.filter(r=>getStatus(r)==='pending').length
  const okN = invRecords.filter(r=>getStatus(r)==='ok'||getStatus(r)==='exported').length
  const eN  = invRecords.filter(r=>getStatus(r)==='error').length
  const modalRec   = modal?invRecords.find(r=>r.id===modal.fileId):null
  const modalEntry = modalRec?getEntry(modalRec):null

  if(!role.tabs.includes(1)) return <NoAccess role={role}/>

  return(
    <div style={{animation:'fadeUp .3s ease'}}>
      {/* 賣方選擇 */}
      <Card style={{padding:'18px 20px',marginBottom:20}}>
        <div style={{fontSize:10,fontFamily:"'Outfit',sans-serif",color:C.textMuted,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:12}}>選擇賣方公司</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
          {SELLERS.map((s,i)=>(
            <button key={i} onClick={()=>setSi(i)} style={{
              padding:'10px 16px',borderRadius:10,cursor:'pointer',
              fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12,transition:'all .15s',
              background:si===i?C.blueLight:C.bg,
              border:`1px solid ${si===i?C.blue:C.border}`,
              color:si===i?C.blueDark:C.textSub,
              boxShadow:si===i?`0 0 0 3px ${C.blue}18`:'none',
            }}>
              <div style={{fontSize:10,color:si===i?C.blue:C.textMuted,fontFamily:"'Outfit',monospace",marginBottom:2}}>{s.taxId}</div>
              {s.name}{i===0&&<span style={{marginLeft:6,fontSize:9,color:C.wood,fontWeight:700}}>預設</span>}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:16,padding:'10px 14px',background:C.bgWarm,borderRadius:8,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',sans-serif"}}>📍 {SELLERS[si].addr}</span>
          <span style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',sans-serif"}}>📞 {SELLERS[si].tel}</span>
        </div>
      </Card>

      {/* 統計列 */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        {[['待驗證',pN,C.textSub,C.bg],['有錯誤',eN,C.red,C.redBg],['通過',okN,C.green,C.greenBg]].map(([l,v,c,bg])=>(
          <div key={l} style={{background:bg,border:`1px solid ${c}33`,borderRadius:12,padding:'7px 14px',display:'flex',gap:5,alignItems:'baseline'}}>
            <span style={{fontSize:20,fontWeight:800,color:c,fontFamily:"'Playfair Display',serif"}}>{v}</span>
            <span style={{fontSize:11,color:c,fontFamily:"'Outfit',sans-serif",fontWeight:600}}>{l}</span>
          </div>
        ))}
        <div style={{flex:1}}/>
        <span style={{fontSize:11,color:C.textMuted,fontFamily:"'Outfit',sans-serif"}}>
          今日匯出 <span style={{color:C.blue,fontWeight:700}}>#{exportSeq}</span>　·　下次 #{exportSeq+1}
        </span>
      </div>

      {/* 勾選操作列 */}
      {selected.size>0&&(
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14,padding:'10px 14px',background:C.blueLight,border:`1px solid ${C.blue}33`,borderRadius:10,flexWrap:'wrap'}}>
          <span style={{fontSize:12,color:C.blueDark,fontFamily:"'Outfit',sans-serif",fontWeight:600}}>已選 {selected.size} 個檔案</span>
          <div style={{flex:1}}/>
          {canVerify&&(
            <Btn onClick={doVerifySelected} disabled={batchLoading} style={{padding:'7px 16px',fontSize:12}}>
              {batchLoading?<><Spinner/> 驗證中…</>:'▶ 驗證所選'}
            </Btn>
          )}
          {canExport&&(
            <Btn onClick={doExportSelected} disabled={batchLoading} variant="wood" style={{padding:'7px 16px',fontSize:12}}>
              {batchLoading?<><Spinner/> 匯出中…</>:'⬇ 匯出所選 CSV'}
            </Btn>
          )}
          <Btn onClick={()=>setSelected(new Set())} variant="ghost" style={{padding:'7px 12px',fontSize:12}}>取消選取</Btn>
        </div>
      )}

      {/* 列表 */}
      {invRecords.length===0?(
        <Card style={{textAlign:'center',padding:'60px 20px'}}>
          <div style={{fontSize:40,marginBottom:10,opacity:.3}}>🔍</div>
          <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:C.textMuted}}>今日尚未上傳任何發票檔案</p>
        </Card>
      ):(
        <Card>
          {/* 表頭 + 全選 */}
          <div style={{display:'grid',gridTemplateColumns:'36px 36px 1fr 76px 76px 52px 110px 1fr',padding:'10px 16px',background:C.bgWarm,fontSize:10,fontFamily:"'Outfit',sans-serif",color:C.textMuted,letterSpacing:'0.07em',fontWeight:600,textTransform:'uppercase',gap:8,alignItems:'center',borderBottom:`1px solid ${C.border}`}}>
            {/* 全選 checkbox */}
            <input type="checkbox"
              checked={selected.size===invRecords.length && invRecords.length>0}
              onChange={toggleAll}
              style={{cursor:'pointer',width:15,height:15,accentColor:C.blue}}
            />
            <span/>
            {['檔案名稱','大小','筆數','錯誤','上傳時間','操作'].map((h,i)=><span key={i} style={{textAlign:i===5?'center':'left'}}>{h}</span>)}
          </div>
          {invRecords.map((rec,idx)=>{
            const entry   = getEntry(rec)
            const status  = getStatus(rec)
            const vN = entry?.invoices?.filter(i=>i.valid).length??0
            const iN = entry?.invoices?.length??0
            const rE = (entry?.errors?.length??0)+(entry?.invoices?.filter(i=>!i.valid).length??0)
            const isLoad = dlLoading===rec.id
            const isChecked = selected.has(rec.id)
            return(
              <div key={rec.id} style={{
                display:'grid',gridTemplateColumns:'36px 36px 1fr 76px 76px 52px 110px 1fr',
                padding:'13px 16px',alignItems:'center',gap:8,
                borderBottom:idx<invRecords.length-1?`1px solid ${C.borderLight}`:'none',
                background:isChecked?C.blueLight+'66':'transparent',
                transition:'background .12s',
              }}
                onMouseEnter={e=>{ if(!isChecked) e.currentTarget.style.background=C.bgHover }}
                onMouseLeave={e=>{ e.currentTarget.style.background=isChecked?C.blueLight+'66':'transparent' }}
              >
                {/* Checkbox */}
                <input type="checkbox" checked={isChecked} onChange={()=>toggleOne(rec.id)}
                  style={{cursor:'pointer',width:15,height:15,accentColor:C.blue}}/>
                {/* 狀態圖示 */}
                <span style={{fontSize:14,textAlign:'center'}}>
                  {isLoad?<Spinner/>:status==='ok'?'✅':status==='error'?'❌':status==='exported'?'📤':'⏳'}
                </span>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:C.text}} title={rec.name}>{rec.name}</div>
                  <Badge status={status}/>
                </div>
                <span style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',monospace"}}>{fmtBytes(rec.size)}</span>
                <span style={{fontSize:11,color:iN>0?C.text:C.textMuted,fontFamily:"'Outfit',monospace"}}>{iN>0?`${vN}/${iN}`:'—'}</span>
                <span style={{fontSize:11,color:rE>0?C.red:C.green,fontFamily:"'Outfit',monospace"}}>{status==='pending'?'—':rE>0?rE:'✓'}</span>
                <span style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',monospace"}}>{fmtTime(new Date(rec.uploaded_at).getTime())}</span>
                <div style={{display:'flex',gap:5,justifyContent:'center',flexWrap:'wrap'}}>
                  {isLoad&&<span style={{fontSize:11,color:C.blue}}><Spinner/></span>}
                  {!isLoad&&(status==='pending'||status==='checking')&&<Btn onClick={()=>checkFile(rec,SELLERS[si].taxId)} style={{padding:'5px 10px',fontSize:11}}>▶ 驗證</Btn>}
                  {!isLoad&&status==='error'&&<Btn onClick={()=>checkFile(rec,SELLERS[si].taxId)} variant="ghost" style={{padding:'5px 10px',fontSize:11}}>↺ 重試</Btn>}
                  {!isLoad&&entry?.invoices?.length>0&&<Btn onClick={()=>setModal({type:'preview',fileId:rec.id})} variant="ghost" style={{padding:'5px 10px',fontSize:11}}>👁</Btn>}
                  {!isLoad&&status==='error'&&rE>0&&<Btn onClick={()=>setModal({type:'errors',fileId:rec.id})} variant="danger" style={{padding:'5px 10px',fontSize:11}}>⚠</Btn>}
                  {!isLoad&&(status==='ok'||status==='exported')&&<Btn onClick={()=>doExportSingle(rec)} variant="wood" style={{padding:'5px 10px',fontSize:11}}>⬇</Btn>}
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {/* 錯誤 Modal */}
      {modal?.type==='errors'&&modalEntry&&(
        <Modal title={`驗證錯誤 — ${modalRec?.name}`} onClose={()=>setModal(null)}>
          <p style={{color:C.textSub,fontSize:12,marginBottom:14,fontFamily:"'Outfit',sans-serif"}}>請修正後重新上傳：</p>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[...(modalEntry.errors||[]).map((e,i)=>({key:`g${i}`,row:e.row,inv:'',msgs:e.msgs})),
              ...(modalEntry.invoices||[]).filter(i=>!i.valid).map((v,i)=>({key:`r${i}`,row:v.sourceRow,inv:v.invoiceNo,msgs:v.errs}))
            ].map(it=>(
              <div key={it.key} style={{background:C.redBg,border:`1px solid ${C.red}33`,borderRadius:10,padding:'10px 14px'}}>
                <div style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',sans-serif",marginBottom:4,fontWeight:600}}>第 {it.row} 列{it.inv?` · ${it.inv}`:''}</div>
                {it.msgs.map((m,j)=><div key={j} style={{fontSize:12,color:C.red}}>· {m}</div>)}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* 明細 Modal */}
      {modal?.type==='preview'&&modalEntry&&(
        <Modal title={`發票明細 — ${modalRec?.name}`} onClose={()=>setModal(null)} wide>
          <p style={{color:C.textSub,fontSize:11,fontFamily:"'Outfit',sans-serif",marginBottom:14}}>
            共 {modalEntry.invoices.length} 筆　·　<span style={{color:C.green,fontWeight:600}}>{modalEntry.invoices.filter(i=>i.valid).length} 可匯出</span>
          </p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr style={{background:C.bgWarm}}>
                {['發票號碼','日期','買方名稱','統編','含稅金額','狀態'].map(h=>(
                  <th key={h} style={{padding:'8px 12px',color:C.textMuted,fontFamily:"'Outfit',sans-serif",textAlign:'left',borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {modalEntry.invoices.map((v,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${C.borderLight}`,background:i%2?C.bg:C.bgPanel}}>
                    <td style={{padding:'8px 12px',color:C.text,fontFamily:"'Outfit',monospace",fontSize:12}}>{v.invoiceNo||'—'}</td>
                    <td style={{padding:'8px 12px',color:C.textSub,fontFamily:"'Outfit',monospace",fontSize:12}}>{toADDateCSV(v.invoiceDate)}</td>
                    <td style={{padding:'8px 12px',color:C.textSub,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}}>{v.buyerName||'—'}</td>
                    <td style={{padding:'8px 12px',color:C.textSub,fontFamily:"'Outfit',monospace",fontSize:12}}>{v.buyerTaxId||'—'}</td>
                    <td style={{padding:'8px 12px',color:C.green,fontFamily:"'Outfit',monospace",textAlign:'right',fontWeight:600,fontSize:12}}>{v.totalAmt!==''?Number(v.totalAmt).toLocaleString():'—'}</td>
                    <td style={{padding:'8px 12px'}}><Badge status={v.valid?'ok':'error'}/></td>
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
function PDFModal({rec, blobUrl, onClose}){
  const handlePrint = () => {
    const iframe = document.getElementById('pdf-preview-iframe')
    if(iframe) iframe.contentWindow.print()
  }
  return(
    <div style={{position:'fixed',inset:0,zIndex:999,background:'rgba(61,53,48,.55)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:18,width:'100%',maxWidth:900,height:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(61,53,48,.18)',overflow:'hidden'}}>
        {/* 工具列 */}
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'13px 20px',background:C.bgWarm,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <span style={{fontSize:20}}>📄</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:"'Outfit',sans-serif"}}>{rec.name}</div>
            <div style={{fontSize:11,color:C.textMuted,fontFamily:"'Outfit',sans-serif"}}>{fmtBytes(rec.size)}</div>
          </div>
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            <button onClick={handlePrint} style={{display:'flex',alignItems:'center',gap:6,background:C.blue,border:`1px solid ${C.blue}`,color:'#fff',borderRadius:9,padding:'8px 16px',fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12,cursor:'pointer',boxShadow:`0 2px 8px ${C.blue}33`,transition:'all .15s'}}
              onMouseEnter={e=>e.currentTarget.style.filter='brightness(0.9)'}
              onMouseLeave={e=>e.currentTarget.style.filter=''}>🖨 列印</button>
            <button onClick={onClose} style={{background:'none',border:`1px solid ${C.border}`,color:C.textSub,borderRadius:9,padding:'8px 14px',cursor:'pointer',fontSize:15,transition:'all .15s'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.red;e.currentTarget.style.color=C.red}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSub}}>✕</button>
          </div>
        </div>
        {/* PDF iframe */}
        <div style={{flex:1,background:'#525659',overflow:'hidden'}}>
          <iframe id="pdf-preview-iframe" src={blobUrl} style={{width:'100%',height:'100%',border:'none'}} title={rec.name}/>
        </div>
      </div>
    </div>
  )
}

function Tab3({records,onAddFiles,role,onDeleteFile,currentUserName}){
  const [drag,setDrag]         = useState(false)
  const [uploading,setUpl]     = useState(false)
  const [previewLoading,setPL] = useState(null)
  const [previewData,setPD]    = useState(null) // {rec, blobUrl}
  const ref=useRef()
  const canUp=role.canUploadTab3
  const t3=records.filter(r=>r.tab_type==='tab3').sort((a,b)=>new Date(b.uploaded_at)-new Date(a.uploaded_at))
  const handleFiles=async files=>{setUpl(true);await onAddFiles(files);setUpl(false)}

  const openPreview=async rec=>{
    setPL(rec.id)
    try{
      const blob=await downloadFileBlob(PDF_BUCKET,rec.storage_path)
      const url=URL.createObjectURL(blob)
      setPD({rec,blobUrl:url})
    }catch(e){alert('載入失敗：'+e.message)}
    setPL(null)
  }

  const closePreview=()=>{
    if(previewData?.blobUrl) URL.revokeObjectURL(previewData.blobUrl)
    setPD(null)
  }
  return(
    <div style={{animation:'fadeUp .3s ease'}}>
      {/* 上傳區 */}
      <div style={{marginBottom:32}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <span style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:16,color:C.text}}>附件上傳</span>
          <span style={{fontSize:10,fontFamily:"'Outfit',sans-serif",
            color:canUp?C.amber:C.red,background:canUp?C.amberBg:C.redBg,
            border:`1px solid ${canUp?C.amber+'44':C.red+'44'}`,borderRadius:20,padding:'2px 9px',fontWeight:600}}>
            {canUp?'✓ 有上傳權限':'🔒 無上傳權限'}
          </span>
        </div>
        {canUp?(
          <div
            onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);handleFiles([...e.dataTransfer.files])}}
            onClick={()=>ref.current.click()}
            style={{border:`2px dashed ${drag?C.amber:C.wood}`,borderRadius:16,padding:'40px 24px',textAlign:'center',cursor:'pointer',background:drag?C.amberBg:C.bgWarm,transition:'all .2s',opacity:uploading?0.7:1}}>
            {uploading?<div style={{fontSize:32,marginBottom:10}}><Spinner/></div>:<div style={{fontSize:40,marginBottom:10}}>📎</div>}
            <p style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:16,marginBottom:5,color:C.text}}>{uploading?'上傳中…':'拖曳附件至此，或點擊選取'}</p>
            <p style={{color:C.textSub,fontSize:12,fontFamily:"'Outfit',sans-serif"}}>支援 .pdf　☁ 儲存至雲端</p>
            <input ref={ref} type="file" multiple accept=".pdf," style={{display:'none'}}
            //<input ref={ref} type="file" multiple style={{display:'none'}} 
              onChange={e=>{handleFiles([...e.target.files]);e.target.value=''}}/>
          </div>
        ):(
          <Card style={{padding:'40px 24px',textAlign:'center',background:C.bgWarm}}>
            <div style={{fontSize:36,marginBottom:10,opacity:.2}}>🔒</div>
            <p style={{color:C.textMuted,fontSize:13,fontFamily:"'Outfit',sans-serif"}}>目前身份（{role.icon} {role.label}）無法上傳附件</p>
          </Card>
        )}
      </div>

      {/* 下載區 */}
      <div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
          <span style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:16,color:C.text}}>附件下載</span>
          <span style={{fontSize:10,fontFamily:"'Outfit',sans-serif",color:C.green,background:C.greenBg,border:`1px solid ${C.green}33`,borderRadius:20,padding:'2px 9px',fontWeight:600}}>✓ 無需權限</span>
          <span style={{fontSize:10,fontFamily:"'Outfit',sans-serif",color:C.amber,background:C.amberBg,border:`1px solid ${C.amber}33`,borderRadius:20,padding:'2px 9px',fontWeight:600}}>{t3.length} 個附件</span>
        </div>
        {t3.length===0?(
          <Card style={{textAlign:'center',padding:'52px 20px',background:C.bgWarm}}>
            <div style={{fontSize:40,marginBottom:10,opacity:.3}}>📂</div>
            <p style={{fontFamily:"'Outfit',sans-serif",fontSize:13,color:C.textMuted}}>尚無可下載的附件</p>
          </Card>
        ):(
          <Card>
            <div style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 140px 90px',padding:'10px 18px',background:C.bgWarm,fontSize:10,fontFamily:"'Outfit',sans-serif",color:C.textMuted,letterSpacing:'0.07em',fontWeight:600,textTransform:'uppercase',gap:8,borderBottom:`1px solid ${C.border}`}}>
              {['','檔案名稱','大小','上傳時間','操作'].map((h,i)=><span key={i} style={{textAlign:i===4?'center':'left'}}>{h}</span>)}
            </div>
            {t3.map((rec,idx)=>(
              const isOwner = rec.uploader === currentUserName
              return(
                <div key={rec.id} style={{display:'grid',gridTemplateColumns:'28px 1fr 80px 140px 140px',padding:'13px 18px',alignItems:'center',gap:8,borderBottom:idx<t3.length-1?`1px solid ${C.borderLight}`:'none'}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bgHover}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{fontSize:17,textAlign:'center'}}>{fileIcon(rec.name)}</span>
                  <div style={{minWidth:0}}>
                    <span style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:C.text,display:'block'}} title={rec.name}>{rec.name}</span>
                    {rec.uploader&&<div style={{fontSize:10,color:C.textMuted,fontFamily:"'Outfit',sans-serif",marginTop:2}}>{rec.uploader}</div>}
                  </div>
                  <span style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',monospace"}}>{fmtBytes(rec.size)}</span>
                  <span style={{fontSize:11,color:C.textSub,fontFamily:"'Outfit',monospace"}}>{fmtTime(new Date(rec.uploaded_at).getTime())}</span>
                  <div style={{display:'flex',justifyContent:'center',gap:4,flexWrap:'wrap'}}>
                    {previewLoading===rec.id?<Spinner/>:(
                      <>
                        {isOwner && (
                          <Btn 
                            onClick={() => onDeleteFile(rec)}
                            variant="danger" 
                            style={{padding:'5px 10px',fontSize:11}}
                          >
                            🗑 刪除
                          </Btn>
                        )}
                        <Btn onClick={()=>openPreview(rec)} variant="primary" style={{padding:'5px 10px',fontSize:11}}>👁 預覽</Btn>
                      </>
                    )}
                  </div>
                </div>
              )
            ))}
          </Card>
        )}
      </div>
      {previewData&&<PDFModal rec={previewData.rec} blobUrl={previewData.blobUrl} onClose={closePreview}/>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 根元件
// ═══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [session,setSession]        = useState(undefined)
  const [role,setRole]              = useState(()=>ROLES.find(x=>x.id===localStorage.getItem('einvoice-role'))||ROLES[0])
  const [tab,setTab]                = useState(0)
  const [records,setRecords]        = useState([])
  const [loadingRecords,setLoading] = useState(true)
  const [exportSeq,setExportSeq]    = useState(0)
  const [showAdmin,setShowAdmin]    = useState(false)
  const [deleting,setDeleting]      = useState(false) ////////////////////

  useEffect(()=>{
    const ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzdGNza3l2eWp3YnlidnZ4YXhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzc4NzgsImV4cCI6MjA5NDkxMzg3OH0.kgdDE9iZ6sp6NWD8Rn21n6METZkUXCWt7E03GM-pZ-4'
    const loadRole=async(email,token)=>{
      try{
        const res=await fetch(`https://tstcskyvyjwbybvvxaxd.supabase.co/rest/v1/user_roles?select=role&email=eq.${encodeURIComponent(email)}&limit=1`,
          {headers:{'apikey':ANON_KEY,'Authorization':`Bearer ${token}`}})
        const data=await res.json()
        return data?.[0]?.role||'staff'
      }catch{return'staff'}
    }
    const{data:{subscription}}=supabase.auth.onAuthStateChange(async(event,sess)=>{
      if(event==='SIGNED_OUT'){localStorage.removeItem('einvoice-role');setSession(null);setRole(ROLES[0]);return}
      if(sess?.user&&sess.access_token){
        setSession(sess)
        const email=sess.user.user_metadata?.email||sess.user.email||''
        const r=await loadRole(email,sess.access_token)
        const found=ROLES.find(x=>x.id===r)||ROLES[0]
        localStorage.setItem('einvoice-role',found.id)
        setRole(found)
      }else{setSession(null)}
    })
    return()=>subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!session)return
    ;(async()=>{
      setLoading(true)
      try{const[recs,seq]=await Promise.all([fetchRecords(),getSeq(todayKey())]);setRecords(recs);setExportSeq(seq)}
      catch(e){console.error(e)}
      setLoading(false)
    })()
  },[session])

  useEffect(()=>{
    if(!session)return
    const t=setInterval(async()=>{try{setRecords(await fetchRecords())}catch{}},30000)
    return()=>clearInterval(t)
  },[session])

  const currentUserName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || '' ////////////

  const addTab1=useCallback(async files=>{
    for(const f of files){
      if(!f.name.match(/\.(xlsx|xls|xlsm)$/i))continue
      const id=`t1-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const path=`${todayKey()}/${id}_${sanitizeFilename(f.name)}`  // storage路徑用安全檔名
      try{
        await uploadFile(EXCEL_BUCKET,path,f)
        const rec={id,name:f.name,size:f.size,uploaded_at:new Date().toISOString(),tab_type:'tab1',status:'pending',storage_path:path,uploader:currentUserName}
        await insertRecord(rec);setRecords(p=>[rec,...p])
      }catch(e){alert('上傳失敗：'+e.message)}
    }
  },[role,session,currentUserName])

  const addTab3=useCallback(async files=>{
    for(const f of files){
      //if(!f.name.match(/\.(pdf)$/i))continue
      if(!/\.pdf$/i.test(f.name))continue
      const id=`t3-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const path=`${todayKey()}/${id}_${sanitizeFilename(f.name)}`  // storage路徑用安全檔名
      try{
        await uploadFile(PDF_BUCKET,path,f)
        const rec={id,name:f.name,size:f.size,uploaded_at:new Date().toISOString(),tab_type:'tab3',status:'attach',storage_path:path,uploader:currentUserName}
        await insertRecord(rec);setRecords(p=>[rec,...p])
      }catch(e){alert('上傳失敗：'+e.message)}
    }
  },[role,session,currentUserName])

  const handleStatusUpdate=useCallback((id,status)=>{
    setRecords(p=>p.map(r=>r.id===id?{...r,status}:r))
  },[])

  const handleDeleteFile = useCallback(async (rec) => {
    if (!confirm(`確定要刪除「${rec.name}」？此操作無法復原。`)) return
    setDeleting(true)
    try {
      const bucket = rec.tab_type === 'tab1' ? EXCEL_BUCKET : PDF_BUCKET
      await deleteRecord(rec.id, rec.storage_path, bucket)
      setRecords(p => p.filter(r => r.id !== rec.id))
    } catch (e) {
      alert('刪除失敗：' + e.message)
    }
    setDeleting(false)
  }, [])
  
  useEffect(()=>{
    const t=setTimeout(()=>setSession(s=>s===undefined?null:s),5000)
    return()=>clearTimeout(t)
  },[])

  if(session===undefined) return(
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <span style={{color:C.textMuted,fontFamily:"'Outfit',sans-serif",fontSize:13}}><Spinner/> 載入中…</span>
    </div>
  )
  if(!session) return <LoginPage/>

  const TABS=[
    {label:'上傳',      icon:'📤'},
    {label:'驗證 & 匯出',icon:'✅',locked:!role.tabs.includes(1)},
    {label:'附件管理',  icon:'📎'},
  ]
  const todayN=records.filter(r=>isToday(new Date(r.uploaded_at).getTime())).length

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg};color:${C.text};font-family:'Outfit',sans-serif}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${C.bgWarm}}
        ::-webkit-scrollbar-thumb{background:${C.wood};border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:${C.woodDark}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* 頂部木紋裝飾條 */}
      <div style={{height:4,background:`linear-gradient(90deg,${C.woodLight},${C.wood},${C.blue},${C.wood},${C.woodLight})`}}/>

      <div style={{minHeight:'100vh',background:C.bg,padding:'28px 24px 60px'}}>
        <div style={{maxWidth:1060,margin:'0 auto'}}>

          {/* ── Header ── */}
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:28,flexWrap:'wrap'}}>
            <div style={{width:48,height:48,borderRadius:14,fontSize:24,background:`linear-gradient(135deg,${C.blue},${C.wood})`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 4px 14px ${C.blue}33`}}>🧾</div>
            <div>
              <h1 style={{fontSize:22,fontFamily:"'Playfair Display',serif",fontWeight:700,color:C.text,lineHeight:1}}>電子發票轉檔平台</h1>
              <p style={{color:C.textMuted,fontSize:11,fontFamily:"'Outfit',sans-serif",marginTop:3}}>ERP 銷貨單 Excel → 財政部申報 CSV　·　☁ 雲端儲存</p>
            </div>
            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              {/* 今日統計 */}
              <div style={{textAlign:'right',padding:'6px 12px',background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:10}}>
                <div style={{fontSize:10,color:C.textMuted,fontFamily:"'Outfit',sans-serif"}}>{todayTW()} 台灣時間</div>
                <div style={{fontSize:13,fontWeight:700,color:C.blue,fontFamily:"'Outfit',sans-serif"}}>今日 {todayN} 筆 {loadingRecords&&<Spinner/>}</div>
              </div>
              {/* 使用者 */}
              <div style={{background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:10,padding:'7px 13px'}}>
                <div style={{fontSize:12,fontWeight:700,color:C.text}}>{session.user?.user_metadata?.name||session.user?.email?.split('@')[0]}</div>
                <div style={{fontSize:10,color:C.textMuted}}>{session.user?.email}</div>
              </div>
              <RoleBadge role={role}/>
              {role.id==='admin'&&(
                <button onClick={()=>setShowAdmin(true)} style={{background:C.blueLight,border:`1px solid ${C.blue}44`,color:C.blueDark,borderRadius:10,padding:'9px 14px',cursor:'pointer',fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12,transition:'all .15s'}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.blueMid}
                  onMouseLeave={e=>e.currentTarget.style.background=C.blueLight}>🛡 權限管理</button>
              )}
              <button onClick={async()=>{
                localStorage.removeItem('einvoice-role')
                await supabase.auth.signOut()
                window.location.replace(window.location.origin)
              }} style={{background:C.bgPanel,border:`1px solid ${C.border}`,color:C.textSub,borderRadius:10,padding:'9px 14px',cursor:'pointer',fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12,transition:'all .15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.red;e.currentTarget.style.color=C.red}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSub}}>登出</button>
            </div>
          </div>

          {showAdmin&&<AdminPanel onClose={()=>setShowAdmin(false)}/>}

          {/* ── Tab bar ── */}
          <div style={{display:'flex',gap:2,marginBottom:24,background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:14,padding:5,boxShadow:'0 2px 8px rgba(61,53,48,.05)'}}>
            {TABS.map((t,i)=>{
              const active=tab===i,locked=t.locked
              return(
                <button key={i} onClick={()=>{if(!locked)setTab(i)}} style={{
                  flex:1, padding:'11px 10px', borderRadius:10, border:'none',
                  cursor:locked?'not-allowed':'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                  transition:'all .2s', opacity:locked?0.35:1,
                  background:active?C.bgWarm:'transparent',
                  boxShadow:active?`inset 0 0 0 1px ${C.border}`:'none',
                }}>
                  <span style={{fontSize:15}}>{t.icon}</span>
                  <span style={{fontSize:13,fontWeight:active?700:500,color:active?C.text:locked?C.textMuted:C.textSub,fontFamily:"'Outfit',sans-serif",whiteSpace:'nowrap'}}>{t.label}</span>
                  {i===0&&records.filter(r=>r.tab_type==='tab1').length>0&&(
                    <span style={{fontSize:10,color:C.blue,fontFamily:"'Outfit',sans-serif",fontWeight:700,background:C.blueLight,border:`1px solid ${C.blue}33`,borderRadius:20,padding:'1px 7px'}}>
                      {records.filter(r=>r.tab_type==='tab1').length}
                    </span>
                  )}
                  {i===2&&records.filter(r=>r.tab_type==='tab3').length>0&&(
                    <span style={{fontSize:10,color:C.amber,fontFamily:"'Outfit',sans-serif",fontWeight:700,background:C.amberBg,border:`1px solid ${C.amber}33`,borderRadius:20,padding:'1px 7px'}}>
                      {records.filter(r=>r.tab_type==='tab3').length}
                    </span>
                  )}
                  {locked&&<span style={{fontSize:11,opacity:.5}}>🔒</span>}
                </button>
              )
            })}
          </div>

          {/* ── 內容 ── */}
          {tab===0&&<Tab1 onAddFiles={addTab1} records={records} loadingRecords={loadingRecords} onDeleteFile={handleDeleteFile} currentUserName={currentUserName}/>}
          {tab===1&&<Tab2 records={records} onStatusUpdate={handleStatusUpdate} role={role} exportSeq={exportSeq} setExportSeq={setExportSeq}/>}
          {tab===2&&<Tab3 records={records} onAddFiles={addTab3} role={role} onDeleteFile={handleDeleteFile} currentUserName={currentUserName}/>}
        </div>
      </div>
    </>
  )
}

import { useState, useEffect } from 'react'
import { fetchAllUserRoles, upsertUserRole, deleteUserRole } from './supabase.js'

const C = {
  bg:'#F7F5F2', bgWarm:'#F0EDE8', bgPanel:'#FFFFFF', bgHover:'#F4F1EC',
  wood:'#C4A882', woodLight:'#E8DDD0', woodDark:'#9B7D5A',
  blue:'#5B9BD5', blueLight:'#D6E8F5', blueDark:'#2F6FA8',
  text:'#3D3530', textSub:'#8C7B6B', textMuted:'#B8AA9E',
  border:'#E0D5C8', borderLight:'#EDE8E1',
  green:'#6BA58A', greenBg:'#EAF4EF',
  red:'#C97B6E', redBg:'#FAF0EE',
  purple:'#8B7EC8', purpleBg:'#F0EDF8',
}

const ROLE_LABELS = { staff:'一般人員', finance:'財務人員', admin:'系統管理員' }
const ROLE_STYLES = {
  staff:   { color:C.textSub,  bg:C.bgHover,   border:C.border },
  finance: { color:C.green,    bg:C.greenBg,   border:C.green+'44' },
  admin:   { color:C.blueDark, bg:C.blueLight, border:C.blue+'44' },
}

export default function AdminPanel({ onClose }) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [newEmail,setNewEmail]= useState('')
  const [newRole, setNewRole] = useState('finance')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  useEffect(()=>{ load() },[])

  async function load() {
    setLoading(true)
    try { setUsers(await fetchAllUserRoles()) } catch(e) { setError(e.message) }
    setLoading(false)
  }

  async function handleAdd() {
    if (!newEmail.includes('@')) return setError('請輸入有效的 email')
    setSaving(true); setError('')
    try { await upsertUserRole(newEmail.trim().toLowerCase(), newRole); setNewEmail(''); await load() }
    catch(e) { setError(e.message) }
    setSaving(false)
  }

  async function handleRoleChange(email, role) {
    try { await upsertUserRole(email, role); await load() } catch(e) { setError(e.message) }
  }

  async function handleDelete(email) {
    if (!confirm(`確定要移除 ${email} 的權限設定？`)) return
    try { await deleteUserRole(email); await load() } catch(e) { setError(e.message) }
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:999,background:'rgba(61,53,48,.4)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Outfit',sans-serif"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:20,padding:'28px 32px',width:'100%',maxWidth:620,maxHeight:'84vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(61,53,48,.15)'}}>

        {/* 標題 */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:700,color:C.text,fontSize:18,lineHeight:1}}>權限管理</h2>
            <p style={{fontSize:11,color:C.textMuted,marginTop:4}}>設定各帳號的存取權限</p>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',fontSize:20,padding:'4px 8px',borderRadius:6,transition:'background .15s'}}
            onMouseEnter={e=>e.currentTarget.style.background=C.bgHover}
            onMouseLeave={e=>e.currentTarget.style.background='none'}>✕</button>
        </div>

        {/* 新增 */}
        <div style={{background:C.bgWarm,border:`1px solid ${C.border}`,borderRadius:12,padding:'16px 18px',marginBottom:20}}>
          <p style={{fontSize:11,color:C.textMuted,fontWeight:600,letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:12}}>新增 / 修改使用者</p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <input
              value={newEmail} onChange={e=>setNewEmail(e.target.value)}
              placeholder="user@autech.com.tw"
              onKeyDown={e=>e.key==='Enter'&&handleAdd()}
              style={{flex:'1 1 220px',background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 12px',fontFamily:"'Outfit',sans-serif",fontSize:12,outline:'none',transition:'border .15s'}}
              onFocus={e=>e.target.style.borderColor=C.blue}
              onBlur={e=>e.target.style.borderColor=C.border}
            />
            <select value={newRole} onChange={e=>setNewRole(e.target.value)}
              style={{background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 12px',fontFamily:"'Outfit',sans-serif",fontSize:12,cursor:'pointer',outline:'none'}}>
              <option value="staff">一般人員</option>
              <option value="finance">財務人員</option>
              <option value="admin">系統管理員</option>
            </select>
            <button onClick={handleAdd} disabled={saving||!newEmail}
              style={{background:C.blue,border:`1px solid ${C.blue}`,color:'#fff',borderRadius:8,padding:'9px 18px',fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12,cursor:saving||!newEmail?'not-allowed':'pointer',opacity:saving||!newEmail?0.5:1,transition:'all .15s',boxShadow:'0 2px 6px rgba(91,155,213,.3)'}}
              onMouseEnter={e=>{if(!saving&&newEmail)e.currentTarget.style.filter='brightness(0.92)'}}
              onMouseLeave={e=>e.currentTarget.style.filter=''}
            >{saving?'儲存中…':'+ 新增'}</button>
          </div>
          {error&&<p style={{fontSize:11,color:C.red,marginTop:8}}>{error}</p>}
        </div>

        {/* 使用者列表 */}
        <div style={{overflowY:'auto',flex:1}}>
          {loading?(
            <div style={{textAlign:'center',padding:32,color:C.textMuted,fontSize:13}}>載入中…</div>
          ):users.length===0?(
            <div style={{textAlign:'center',padding:32,color:C.textMuted,fontSize:13}}>尚無設定任何使用者</div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {users.map(u=>{
                const rs=ROLE_STYLES[u.role]||ROLE_STYLES.staff
                return(
                  <div key={u.email} style={{display:'flex',alignItems:'center',gap:12,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 14px',transition:'background .12s'}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.bgHover}
                    onMouseLeave={e=>e.currentTarget.style.background=C.bg}>
                    <div style={{width:34,height:34,borderRadius:10,background:rs.bg,border:`1px solid ${rs.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                      {u.role==='admin'?'🛡':u.role==='finance'?'💼':'👤'}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:C.text}}>{u.email}</div>
                      <div style={{fontSize:10,color:C.textMuted,marginTop:2}}>設定於 {new Date(u.updated_at||u.created_at).toLocaleDateString('zh-TW')}</div>
                    </div>
                    <select value={u.role} onChange={e=>handleRoleChange(u.email,e.target.value)}
                      style={{background:rs.bg,border:`1px solid ${rs.border}`,borderRadius:8,color:rs.color,padding:'5px 10px',fontFamily:"'Outfit',sans-serif",fontSize:11,cursor:'pointer',fontWeight:600,outline:'none'}}>
                      <option value="staff">一般人員</option>
                      <option value="finance">財務人員</option>
                      <option value="admin">系統管理員</option>
                    </select>
                    <button onClick={()=>handleDelete(u.email)}
                      style={{background:'none',border:'none',color:C.textMuted,cursor:'pointer',fontSize:16,padding:'4px 6px',borderRadius:6,transition:'all .15s',flexShrink:0}}
                      onMouseEnter={e=>{e.currentTarget.style.color=C.red;e.currentTarget.style.background=C.redBg}}
                      onMouseLeave={e=>{e.currentTarget.style.color=C.textMuted;e.currentTarget.style.background='none'}}>✕</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 說明 */}
        <div style={{marginTop:16,padding:'10px 14px',background:C.bgWarm,border:`1px solid ${C.borderLight}`,borderRadius:10,fontSize:11,color:C.textMuted,lineHeight:1.6}}>
          💡 未設定的帳號預設為「一般人員」。只有 @autech.com.tw 的帳號可以登入。
        </div>

        <button onClick={onClose} style={{marginTop:14,padding:'10px',width:'100%',background:C.bg,border:`1px solid ${C.border}`,color:C.textSub,borderRadius:10,cursor:'pointer',fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:13,transition:'background .15s'}}
          onMouseEnter={e=>e.currentTarget.style.background=C.bgHover}
          onMouseLeave={e=>e.currentTarget.style.background=C.bg}>關閉</button>
      </div>
    </div>
  )
}

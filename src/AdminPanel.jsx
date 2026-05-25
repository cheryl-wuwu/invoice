import { useState, useEffect } from 'react'
import { fetchAllUserRoles, upsertUserRole, deleteUserRole } from './supabase.js'

const ROLE_LABELS = { staff:'一般人員', finance:'財務人員', admin:'系統管理員' }
const ROLE_COLORS = { staff:'#64748b', finance:'#4ade80', admin:'#a78bfa' }

export default function AdminPanel({ onClose }) {
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole]   = useState('finance')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try { setUsers(await fetchAllUserRoles()) }
    catch(e) { setError(e.message) }
    setLoading(false)
  }

  async function handleAdd() {
    if (!newEmail.includes('@')) return setError('請輸入有效的 email')
    setSaving(true); setError('')
    try {
      await upsertUserRole(newEmail.trim().toLowerCase(), newRole)
      setNewEmail(''); await load()
    } catch(e) { setError(e.message) }
    setSaving(false)
  }

  async function handleRoleChange(email, role) {
    try { await upsertUserRole(email, role); await load() }
    catch(e) { setError(e.message) }
  }

  async function handleDelete(email) {
    if (!confirm(`確定要移除 ${email} 的權限設定？`)) return
    try { await deleteUserRole(email); await load() }
    catch(e) { setError(e.message) }
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:999,background:'rgba(0,0,0,.85)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#0d1525',border:'1px solid #a78bfa55',borderRadius:18,padding:'26px 30px',width:'100%',maxWidth:640,maxHeight:'84vh',display:'flex',flexDirection:'column',boxShadow:'0 0 80px #a78bfa10'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,color:'#a78bfa',fontSize:15}}>🛡 權限管理</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:18}}>✕</button>
        </div>

        {/* 新增使用者 */}
        <div style={{background:'#070c18',border:'1px solid #1e293b',borderRadius:12,padding:'14px 16px',marginBottom:20}}>
          <p style={{fontSize:11,color:'#475569',fontFamily:"'DM Mono',monospace",marginBottom:10}}>新增 / 修改使用者權限</p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <input
              value={newEmail} onChange={e=>setNewEmail(e.target.value)}
              placeholder="user@autech.com.tw"
              style={{flex:'1 1 220px',background:'#0d1525',border:'1px solid #1e293b',borderRadius:8,color:'#e2e8f0',padding:'8px 12px',fontFamily:"'DM Mono',monospace",fontSize:12,outline:'none'}}
              onKeyDown={e=>e.key==='Enter'&&handleAdd()}
            />
            <select value={newRole} onChange={e=>setNewRole(e.target.value)} style={{background:'#0d1525',border:'1px solid #1e293b',borderRadius:8,color:'#e2e8f0',padding:'8px 12px',fontFamily:"'DM Mono',monospace",fontSize:12,cursor:'pointer'}}>
              <option value="staff">一般人員</option>
              <option value="finance">財務人員</option>
              <option value="admin">系統管理員</option>
            </select>
            <button onClick={handleAdd} disabled={saving||!newEmail} style={{background:'#312e81',border:'1px solid #6366f1',color:'#a5b4fc',borderRadius:8,padding:'8px 16px',fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,cursor:'pointer',opacity:saving||!newEmail?0.5:1}}>
              {saving?'儲存中…':'+ 新增'}
            </button>
          </div>
          {error&&<p style={{fontSize:11,color:'#f87171',marginTop:8,fontFamily:"'DM Mono',monospace"}}>{error}</p>}
        </div>

        {/* 使用者列表 */}
        <div style={{overflowY:'auto',flex:1}}>
          {loading?(
            <div style={{textAlign:'center',padding:32,color:'#334155',fontFamily:"'DM Mono',monospace",fontSize:13}}>載入中…</div>
          ):users.length===0?(
            <div style={{textAlign:'center',padding:32,color:'#1e293b',fontFamily:"'DM Mono',monospace",fontSize:13}}>尚無設定任何使用者</div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {users.map(u=>(
                <div key={u.email} style={{display:'flex',alignItems:'center',gap:12,background:'#070c18',border:'1px solid #1e293b',borderRadius:10,padding:'10px 14px'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.email}</div>
                    <div style={{fontSize:10,color:'#334155',fontFamily:"'DM Mono',monospace",marginTop:2}}>
                      設定於 {new Date(u.updated_at||u.created_at).toLocaleDateString('zh-TW')}
                    </div>
                  </div>
                  <select
                    value={u.role}
                    onChange={e=>handleRoleChange(u.email,e.target.value)}
                    style={{background:'#0d1525',border:`1px solid ${ROLE_COLORS[u.role]||'#334155'}44`,borderRadius:8,color:ROLE_COLORS[u.role]||'#94a3b8',padding:'5px 10px',fontFamily:"'DM Mono',monospace",fontSize:11,cursor:'pointer',fontWeight:700}}
                  >
                    <option value="staff">一般人員</option>
                    <option value="finance">財務人員</option>
                    <option value="admin">系統管理員</option>
                  </select>
                  <button onClick={()=>handleDelete(u.email)} style={{background:'none',border:'none',color:'#334155',cursor:'pointer',fontSize:16,padding:'0 4px',transition:'color .15s'}}
                    onMouseEnter={e=>e.target.style.color='#f87171'}
                    onMouseLeave={e=>e.target.style.color='#334155'}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{marginTop:16,padding:'10px 14px',background:'#070c18',border:'1px solid #1e293b55',borderRadius:10,fontSize:11,color:'#334155',fontFamily:"'DM Mono',monospace"}}>
          💡 未設定的帳號預設為「一般人員」。只有 @autech.com.tw 的帳號可以登入。
        </div>
      </div>
    </div>
  )
}

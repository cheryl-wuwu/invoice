import { signInWithGoogle } from './supabase.js'

const C = {
  bg:'#F7F5F2', bgWarm:'#F0EDE8', bgPanel:'#FFFFFF',
  wood:'#C4A882', woodLight:'#E8DDD0', woodDark:'#9B7D5A',
  blue:'#5B9BD5', blueLight:'#D6E8F5', blueDark:'#2F6FA8',
  text:'#3D3530', textSub:'#8C7B6B', textMuted:'#B8AA9E',
  border:'#E0D5C8',
}

export default function LoginPage() {
  return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Outfit',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>

      {/* 木紋裝飾條 */}
      <div style={{position:'fixed',top:0,left:0,right:0,height:4,background:`linear-gradient(90deg,${C.woodLight},${C.wood},${C.blue},${C.wood},${C.woodLight})`}}/>

      <div style={{background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:20,padding:'48px 44px',width:'100%',maxWidth:420,textAlign:'center',boxShadow:'0 20px 60px rgba(61,53,48,.10)'}}>

        {/* Logo */}
        <div style={{width:64,height:64,borderRadius:18,fontSize:30,background:`linear-gradient(135deg,${C.blue},${C.wood})`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 24px',boxShadow:`0 6px 20px ${C.blue}33`}}>🧾</div>

        <h1 style={{fontSize:24,fontFamily:"'Playfair Display',serif",fontWeight:700,color:C.text,marginBottom:8,lineHeight:1.2}}>電子發票轉檔平台</h1>
        <p style={{color:C.textMuted,fontSize:12,marginBottom:32,lineHeight:1.6}}>
          僅限 <span style={{color:C.wood,fontWeight:600}}>autech.com.tw</span> 帳號登入
        </p>

        {/* 分隔線 */}
        <div style={{height:1,background:C.border,marginBottom:28,position:'relative'}}>
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:C.bgPanel,padding:'0 12px',fontSize:10,color:C.textMuted,letterSpacing:'0.08em',fontWeight:600,textTransform:'uppercase'}}>使用帳號登入</div>
        </div>

        {/* Google 登入按鈕 */}
        <button
          onClick={signInWithGoogle}
          style={{width:'100%',padding:'14px 20px',background:C.bgPanel,border:`1px solid ${C.border}`,borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:12,fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:14,color:C.text,transition:'all .15s',boxShadow:'0 2px 8px rgba(61,53,48,.08)'}}
          onMouseEnter={e=>{e.currentTarget.style.background=C.bgWarm;e.currentTarget.style.borderColor=C.wood}}
          onMouseLeave={e=>{e.currentTarget.style.background=C.bgPanel;e.currentTarget.style.borderColor=C.border}}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          使用 Google 帳號登入
        </button>

        <p style={{marginTop:24,color:C.textMuted,fontSize:11}}>登入即代表同意本平台的使用規範</p>
      </div>
    </div>
  )
}

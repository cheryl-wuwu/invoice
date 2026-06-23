import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://tstcskyvyjwbybvvxaxd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzdGNza3l2eWp3YnlidnZ4YXhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzc4NzgsImV4cCI6MjA5NDkxMzg3OH0.kgdDE9iZ6sp6NWD8Rn21n6METZkUXCWt7E03GM-pZ-4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})

export const EXCEL_BUCKET = 'Excel bucket'
export const PDF_BUCKET   = 'PDF bucket'

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      hd: 'autech.com.tw',   // 限定只允許 autech.com.tw 的 Google Workspace 帳號
    },
  })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
  window.location.href = '/'  // 強制重新整理，清除 session 狀態
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// ── 使用者角色 ─────────────────────────────────────────────────────────────────

export async function getUserRole(email) {
  if (!email) return 'staff'
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('email', email.toLowerCase().trim())
    .limit(1)
  if (error) { console.warn('getUserRole error:', error.message); return 'staff' }
  return data?.[0]?.role || 'staff'
}

export async function fetchAllUserRoles() {
  const { data, error } = await supabase
    .from('user_roles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function upsertUserRole(email, role) {
  const { error } = await supabase
    .from('user_roles')
    .upsert({ email, role, updated_at: new Date().toISOString() }, { onConflict: 'email' })
  if (error) throw error
}

export async function deleteUserRole(email) {
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('email', email)
  if (error) throw error
}

// ── 上傳紀錄 ──────────────────────────────────────────────────────────────────

export async function fetchRecords() {
  const twoMonthsAgo = new Date()
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
  const { data, error } = await supabase
    .from('upload_records')
    .select('*')
    .gte('uploaded_at', twoMonthsAgo.toISOString())
    .order('uploaded_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data || []
}

export async function insertRecord(rec) {
  const { error } = await supabase.from('upload_records').insert([rec])
  if (error) throw error
}

export async function updateRecordStatus(id, status) {
  const { error } = await supabase
    .from('upload_records')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

export async function deleteRecord(id) {
  const { error } = await supabase
    .from('upload_records')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ── 流水號 ────────────────────────────────────────────────────────────────────

export async function getAndIncrementSeq(dateKey) {
  const { data, error } = await supabase.rpc('increment_export_seq', { p_date_key: dateKey })
  if (error) {
    const { data: existing } = await supabase.from('export_seq').select('seq').eq('date_key', dateKey).single()
    const next = (existing?.seq || 0) + 1
    await supabase.from('export_seq').upsert({ date_key: dateKey, seq: next })
    return next
  }
  return data
}

export async function getSeq(dateKey) {
  const { data } = await supabase.from('export_seq').select('seq').eq('date_key', dateKey).limit(1)
  return data?.[0]?.seq || 0
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function uploadFile(bucket, path, file) {
  console.log('uploading to bucket:', bucket, 'path:', path, 'size:', file.size)
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) {
    console.error('upload error:', error.message, error)
    throw error
  }
  console.log('upload success:', data)
  return data
}

export async function downloadFileBlob(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  return data
}

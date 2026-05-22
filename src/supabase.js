import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://tstcskyvyjwbybvvxaxd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzdGNza3l2eWp3YnlidnZ4YXhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzc4NzgsImV4cCI6MjA5NDkxMzg3OH0.kgdDE9iZ6sp6NWD8Rn21n6METZkUXCWt7E03GM-pZ-4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const EXCEL_BUCKET = 'Excel bucket'
export const PDF_BUCKET   = 'PDF bucket'

// ── 上傳紀錄 CRUD ─────────────────────────────────────────────────────────────

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

// ── 流水號 ────────────────────────────────────────────────────────────────────

export async function getAndIncrementSeq(dateKey) {
  // upsert + increment（用 RPC 避免 race condition）
  const { data, error } = await supabase.rpc('increment_export_seq', { p_date_key: dateKey })
  if (error) {
    // fallback：直接讀寫
    const { data: existing } = await supabase.from('export_seq').select('seq').eq('date_key', dateKey).single()
    const next = (existing?.seq || 0) + 1
    await supabase.from('export_seq').upsert({ date_key: dateKey, seq: next })
    return next
  }
  return data
}

export async function getSeq(dateKey) {
  const { data } = await supabase.from('export_seq').select('seq').eq('date_key', dateKey).single()
  return data?.seq || 0
}

// ── 檔案上傳 / 下載 ───────────────────────────────────────────────────────────

export async function uploadFile(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
}

export async function getFileUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function downloadFileBlob(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  return data
}

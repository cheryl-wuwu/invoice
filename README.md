# 電子發票轉檔平台

## 部署到 Vercel 步驟

1. 到 https://github.com 新增一個 Repository（名稱例如 `einvoice-platform`）
2. 把這個資料夾的所有檔案上傳到 Repository
3. 到 https://vercel.com 登入（可用 GitHub 帳號）
4. 點 "New Project" → 選你剛建的 Repository → Deploy
5. 完成！Vercel 會給你一個網址，所有人用這個網址就可以存取

## Supabase 額外設定（需在 SQL Editor 執行）

```sql
-- 建立流水號原子遞增函式（避免多人同時匯出時號碼重複）
create or replace function increment_export_seq(p_date_key text)
returns int language plpgsql as $$
declare
  v_seq int;
begin
  insert into export_seq (date_key, seq) values (p_date_key, 1)
  on conflict (date_key) do update set seq = export_seq.seq + 1
  returning seq into v_seq;
  return v_seq;
end;
$$;
```

## Storage Bucket Policy

在 Supabase → Storage → Excel bucket → Policies 加入：
- INSERT: true（允許上傳）
- SELECT: true（允許下載）

PDF bucket 同上。

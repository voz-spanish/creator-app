const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../../../login/login.html'
  return session
}

// 今日の日時をdatetime-localの初期値に設定
function setDefaultDatetime() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const local = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  document.getElementById('input-start').value = local
}

// 保存
document.getElementById('btn-save').addEventListener('click', async () => {
  const title = document.getElementById('input-title').value.trim()
  const start = document.getElementById('input-start').value
  const errorMsg = document.getElementById('error-msg')
  errorMsg.textContent = ''

  if (!title) {
    errorMsg.textContent = 'タイトルを入力してください'
    return
  }
  if (!start) {
    errorMsg.textContent = '公開開始日時を入力してください'
    return
  }

  const btn = document.getElementById('btn-save')
  btn.disabled = true
  btn.textContent = '保存中...'

  const { data: { session } } = await db.auth.getSession()
  if (!session) {
    window.location.href = '../../../login/login.html'
    return
  }

  const endVal = document.getElementById('input-end').value
  const { error } = await db.from('announcements').insert({
    title,
    content: document.getElementById('input-content').value,
    url: document.getElementById('input-url').value,
    publish_start: new Date(start).toISOString(),
    publish_end: endVal
      ? (() => { const d = new Date(endVal); d.setSeconds(59); return d.toISOString() })()
      : null,
    scope: document.getElementById('input-scope').value,
    user_id: session.user.id
  })

  if (error) {
    console.error('保存エラー:', error)
    errorMsg.textContent = '保存に失敗しました'
    btn.disabled = false
    btn.textContent = '保存する'
    return
  }

  // 保存成功 → 一覧へ戻る
  window.location.href = '../index.html'
})

// ドロワー
document.getElementById('burger-btn').addEventListener('click', () => {
  document.getElementById('drawer').classList.toggle('open')
  document.getElementById('drawer-overlay').classList.toggle('open')
})
document.getElementById('drawer-overlay').addEventListener('click', () => {
  document.getElementById('drawer').classList.remove('open')
  document.getElementById('drawer-overlay').classList.remove('open')
})

// ログアウト
document.getElementById('logout-btn').addEventListener('click', async () => {
  await db.auth.signOut()
  window.location.href = '../../../login/login.html'
})

// 起動
;(async () => {
  await checkAuth()
  setDefaultDatetime()
})()

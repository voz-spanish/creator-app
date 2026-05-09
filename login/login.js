const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const loginBtn = document.getElementById('login-btn')
const errorMsg = document.getElementById('error-msg')

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()
  errorMsg.textContent = ''

  // 入力チェック
  if (!email || !password) {
    errorMsg.textContent = 'メールアドレスとパスワードを入力してください'
    return
  }

  // ボタンを無効化（二重送信防止）
  loginBtn.disabled = true
  loginBtn.textContent = '確認中...'

  const { error } = await db.auth.signInWithPassword({ email, password })

  if (error) {
    errorMsg.textContent = 'メールアドレスまたはパスワードが正しくありません'
    loginBtn.disabled = false
    loginBtn.textContent = 'ログイン'
    return
  }

  // ログイン成功 → ホーム画面へ
  window.location.href = '../home/home.html'
})

// Enterキーでもログインできるように
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click()
})

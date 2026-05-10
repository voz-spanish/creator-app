const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../../login/login.html'
  return session
}

let allAnnouncements = []

// 公開ステータスを計算
function getStatus(item) {
  const now = new Date()
  const start = new Date(item.publish_start)
  const end = item.publish_end ? new Date(item.publish_end) : null
  if (item.scope === 'draft') return 'draft'
  if (now < start) return 'scheduled'
  if (end && now > end) return 'ended'
  return 'active'
}

function getStatusLabel(status) {
  switch (status) {
    case 'scheduled': return '公開予定'
    case 'active':    return '公開中'
    case 'ended':     return '公開終了'
    default:          return '非公開'
  }
}

function getScopeLabel(scope) {
  switch (scope) {
    case 'free': return 'Free'
    case 'plus': return 'Plus'
    case 'max':  return 'Max'
    default:     return '非公開'
  }
}

function formatDatetime(str) {
  if (!str) return ''
  const d = new Date(str)
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// 一覧取得
async function fetchAnnouncements() {
  const { data, error } = await db
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
  if (!error) allAnnouncements = data
}

// 一覧描画
function renderList(items) {
  const list = document.getElementById('announce-list')
  const empty = document.getElementById('empty-msg')
  list.innerHTML = ''

  if (items.length === 0) {
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  items.forEach(item => {
    const status = getStatus(item)
    const li = document.createElement('li')
    li.className = 'announce-item'

    const endStr = item.publish_end
      ? ` 〜 ${formatDatetime(item.publish_end)}`
      : ''

    li.innerHTML = `
      <div class="announce-title">${item.title}</div>
      <div class="announce-content">${item.content || ''}</div>
      <div class="announce-meta">
        <span class="announce-period">${formatDatetime(item.publish_start)}${endStr}</span>
        <span class="status-badge ${status}">${getStatusLabel(status)}</span>
        <span class="scope-badge">${getScopeLabel(item.scope)}</span>
      </div>
      <div class="announce-actions">
        <button class="btn-edit" data-id="${item.id}">編集</button>
        <button class="btn-delete" data-id="${item.id}">削除</button>
      </div>
    `

    li.querySelector('.btn-edit').addEventListener('click', () => openEdit(item))
    li.querySelector('.btn-delete').addEventListener('click', () => deleteItem(item.id))
    list.appendChild(li)
  })
}

// 検索
document.getElementById('search-input').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase()
  if (!q) { renderList(allAnnouncements); return }
  const filtered = allAnnouncements.filter(a =>
    a.title?.toLowerCase().includes(q) ||
    a.content?.toLowerCase().includes(q)
  )
  renderList(filtered)
})

// 削除
async function deleteItem(id) {
  if (!confirm('削除しますか？')) return
  await db.from('announcements').delete().eq('id', id)
  await fetchAnnouncements()
  renderList(allAnnouncements)
}

// 編集ポップアップを開く
function openEdit(item) {
  document.getElementById('edit-title').value = item.title
  document.getElementById('edit-content').value = item.content || ''
  document.getElementById('edit-url').value = item.url || ''
  document.getElementById('edit-scope').value = item.scope || 'draft'

  // datetime-local用にフォーマット変換
  document.getElementById('edit-start').value = toLocalInput(item.publish_start)
  document.getElementById('edit-end').value = item.publish_end ? toLocalInput(item.publish_end) : ''

  document.getElementById('edit-save').onclick = async () => {
    const title = document.getElementById('edit-title').value.trim()
    const start = document.getElementById('edit-start').value
    if (!title || !start) return

    await db.from('announcements').update({
      title,
      content: document.getElementById('edit-content').value,
      url: document.getElementById('edit-url').value,
      publish_start: new Date(start).toISOString(),
      publish_end: document.getElementById('edit-end').value
        ? new Date(document.getElementById('edit-end').value + ':59').toISOString()
        : null,
      scope: document.getElementById('edit-scope').value
    }).eq('id', item.id)

    closePopup('popup-edit-overlay')
    await fetchAnnouncements()
    renderList(allAnnouncements)
  }

  openPopup('popup-edit-overlay')
}

// datetime-local inputに渡す形式に変換
function toLocalInput(isoStr) {
  const d = new Date(isoStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openPopup(id) { document.getElementById(id).classList.add('open') }
function closePopup(id) { document.getElementById(id).classList.remove('open') }

// ＋ボタン → 作成ページへ
document.getElementById('btn-add').addEventListener('click', () => {
  window.location.href = 'new/new.html'
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
  window.location.href = '../../login/login.html'
})

// 起動
;(async () => {
  await checkAuth()
  await fetchAnnouncements()
  renderList(allAnnouncements)
})()

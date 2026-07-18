const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../login/login.html'
  return session
}

let allPlans = []

// ===== データ取得 =====
async function fetchAll() {
  const { data, error } = await db
    .from('lesson_plans')
    .select(`
      *,
      lesson_plan_items ( id )
    `)
    .order('updated_at', { ascending: false })

  if (!error) {
    allPlans = data || []
  } else {
    console.error(error)
    allPlans = []
  }
}

// ===== フィルター適用 =====
function applyFilter() {
  const q = document.getElementById('search-input').value.trim().toLowerCase()

  let filtered = [...allPlans]
  if (q) filtered = filtered.filter(p => p.title?.toLowerCase().includes(q))

  const drafts = filtered.filter(p => p.status === 'draft')
  const saved  = filtered.filter(p => p.status === 'saved')

  renderList('list-draft',     'empty-draft',     drafts, 'draft')
  renderList('list-published', 'empty-published', saved,  'saved')
}

// ===== リスト描画 =====
function renderList(listId, emptyId, items, type) {
  const list  = document.getElementById(listId)
  const empty = document.getElementById(emptyId)
  list.innerHTML = ''

  if (items.length === 0) {
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  items.forEach(plan => {
    const li = document.createElement('li')
    li.className = `lesson-item ${type === 'draft' ? 'draft' : 'published'}`

    const titleText  = plan.title || '（タイトル未設定）'
    const titleClass = plan.title ? 'lesson-title' : 'lesson-title untitled'

    const itemCount = plan.lesson_plan_items?.length || 0

    const fcParts = []
    if (plan.flashcard_es_jp) fcParts.push('ES→JP')
    if (plan.flashcard_jp_es) fcParts.push('JP→ES')
    const fcLabel = fcParts.length ? `フラッシュカード ${fcParts.join('・')}` : 'フラッシュカードなし'

    const updatedStr = formatDatetime(plan.updated_at)
    const dateLabel   = type === 'draft' ? '最終編集' : '保存日'
    const actionLabel = type === 'draft' ? '編集を続ける' : '編集'

    li.innerHTML = `
      <div class="${titleClass}">${titleText}</div>
      <div class="lesson-meta">${dateLabel}: ${updatedStr}</div>
      <div class="lesson-meta">レッスン ${itemCount}件　／　${fcLabel}</div>
      <div class="lesson-actions">
        <button class="btn-action btn-primary">${actionLabel}</button>
        <button class="btn-action btn-delete">削除</button>
      </div>
    `
    li.querySelector('.btn-primary').addEventListener('click', () => {
      window.location.href = `new/new.html?id=${plan.id}`
    })
    li.querySelector('.btn-delete').addEventListener('click', () => deletePlan(plan.id))

    list.appendChild(li)
  })
}

// ===== 削除 =====
// lesson_plan_items / lesson_plan_sentences は外部キーの ON DELETE CASCADE で
// 自動的に削除されるため、lesson_plans の行を削除するだけでOK
async function deletePlan(id) {
  if (!confirm('このレッスンプランを削除しますか？\n（組み込まれているレッスンの選択情報もすべて削除されます）')) return

  const { error } = await db.from('lesson_plans').delete().eq('id', id)
  if (error) {
    console.error(error)
    alert('削除に失敗しました')
    return
  }

  await fetchAll()
  applyFilter()
}

// ===== 日付フォーマット =====
function formatDatetime(str) {
  if (!str) return ''
  const d = new Date(str)
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// ===== イベント =====
document.getElementById('search-input').addEventListener('input', applyFilter)

document.getElementById('btn-add').addEventListener('click', () => {
  window.location.href = 'new/new.html'
})

document.getElementById('burger-btn').addEventListener('click', () => {
  document.getElementById('drawer').classList.toggle('open')
  document.getElementById('drawer-overlay').classList.toggle('open')
})
document.getElementById('drawer-overlay').addEventListener('click', () => {
  document.getElementById('drawer').classList.remove('open')
  document.getElementById('drawer-overlay').classList.remove('open')
})
document.getElementById('logout-btn').addEventListener('click', async () => {
  await db.auth.signOut()
  window.location.href = '../login/login.html'
})

// ===== 起動 =====
;(async () => {
  await checkAuth()
  await fetchAll()
  applyFilter()
})()

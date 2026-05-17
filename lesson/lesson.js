const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../login/login.html'
  return session
}

let allLessons = []
let allCategories = []
let filterOpen = false

async function fetchAll() {
  const [lessonsRes, catsRes] = await Promise.all([
    db.from('lessons').select('*, lesson_categories(name)').order('updated_at', { ascending: false }),
    db.from('lesson_categories').select('*').order('name')
  ])
  if (!lessonsRes.error) allLessons = lessonsRes.data
  if (!catsRes.error) allCategories = catsRes.data
}

function populateFilterCategory() {
  const sel = document.getElementById('filter-category')
  sel.innerHTML = '<option value="">すべて</option>'
  allCategories.forEach(c => {
    sel.innerHTML += `<option value="${c.id}">${c.name}</option>`
  })
}

function getPublishStatus(lesson) {
  if (lesson.status === 'draft') return 'draft'
  const now = new Date()
  const start = lesson.publish_start ? new Date(lesson.publish_start) : null
  const end = lesson.publish_end ? new Date(lesson.publish_end) : null
  if (start && now < start) return 'scheduled'
  if (end && now > end) return 'ended'
  return 'active'
}

function getStatusLabel(status) {
  switch (status) {
    case 'scheduled': return '公開予定'
    case 'active': return '公開中'
    case 'ended': return '公開終了'
    default: return '非公開'
  }
}

function getScopeLabel(scope) {
  switch (scope) {
    case 'free': return 'Free'
    case 'plus': return 'Plus'
    case 'max': return 'Max'
    default: return '非公開'
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

function applyFilter() {
  const q = document.getElementById('search-input').value.trim().toLowerCase()
  const catId = document.getElementById('filter-category').value
  const tag = document.getElementById('filter-tag').value.trim().toLowerCase()

  let filtered = [...allLessons]
  if (q) filtered = filtered.filter(l => l.title?.toLowerCase().includes(q))
  if (catId) filtered = filtered.filter(l => l.category_id === catId)
  if (tag) filtered = filtered.filter(l => l.tags?.some(t => t.toLowerCase().includes(tag)))

  const drafts = filtered.filter(l => l.status === 'draft')
  const published = filtered.filter(l => l.status === 'published')

  renderList('list-draft', 'empty-draft', drafts, true)
  renderList('list-published', 'empty-published', published, false)
}

function renderList(listId, emptyId, items, isDraft) {
  const list = document.getElementById(listId)
  const empty = document.getElementById(emptyId)
  list.innerHTML = ''

  if (items.length === 0) {
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  items.forEach(lesson => {
    const li = document.createElement('li')
    li.className = `lesson-item ${isDraft ? 'draft' : 'published'}`

    const titleText = lesson.title || '（タイトル未設定）'
    const titleClass = lesson.title ? 'lesson-title' : 'lesson-title untitled'
    const catName = lesson.lesson_categories?.name || ''
    const tagsHtml = (lesson.tags || []).map(t => `<span class="tag-badge" style="font-size:0.62rem;padding:2px 7px;background:color-mix(in srgb,var(--earth) 15%,transparent);color:var(--earth)">${t}</span>`).join('')

    if (isDraft) {
      li.innerHTML = `
        <div class="${titleClass}">${titleText}</div>
        <div class="lesson-meta">最終編集: ${formatDatetime(lesson.updated_at)}</div>
        <div class="lesson-actions">
          <button class="btn-action btn-primary">編集を続ける</button>
          <button class="btn-action">削除</button>
        </div>
      `
      li.querySelector('.btn-primary').addEventListener('click', () => {
        window.location.href = `new/new.html?id=${lesson.id}&step=2`
      })
      li.querySelector('.btn-action:not(.btn-primary)').addEventListener('click', () => deleteLesson(lesson.id))
    } else {
      const pubStatus = getPublishStatus(lesson)
      li.innerHTML = `
        <div class="${titleClass}">${titleText}</div>
        <div class="lesson-meta">${formatDatetime(lesson.publish_start)}</div>
        <div class="lesson-badges">
          <span class="scope-badge">${getScopeLabel(lesson.scope)}</span>
          <span class="status-badge ${pubStatus}">${getStatusLabel(pubStatus)}</span>
          ${catName ? `<span style="font-size:0.62rem;padding:2px 7px;background:color-mix(in srgb,var(--slate) 10%,transparent);color:var(--slate)">${catName}</span>` : ''}
          ${tagsHtml}
        </div>
        <div class="lesson-actions">
          <button class="btn-action btn-primary">確認</button>
          <button class="btn-action">編集</button>
          <button class="btn-action">削除</button>
        </div>
      `
      const btns = li.querySelectorAll('.btn-action')
      btns[0].addEventListener('click', () => {
        window.open(`../student-app/lesson.html?id=${lesson.id}`, '_blank')
      })
      btns[1].addEventListener('click', () => {
        window.location.href = `new/new.html?id=${lesson.id}&step=2`
      })
      btns[2].addEventListener('click', () => deleteLesson(lesson.id))
    }

    list.appendChild(li)
  })
}

async function deleteLesson(id) {
  if (!confirm('このレッスンを削除しますか？')) return
  await db.from('lesson_sentence_vocab').delete().eq('lesson_id', id)
  await db.from('lesson_sentences').delete().eq('lesson_id', id)
  await db.from('lesson_audios').delete().eq('lesson_id', id)
  await db.from('lessons').delete().eq('id', id)
  await fetchAll()
  applyFilter()
}

document.getElementById('search-input').addEventListener('input', applyFilter)
document.getElementById('filter-category').addEventListener('change', applyFilter)
document.getElementById('filter-tag').addEventListener('input', applyFilter)

document.getElementById('filter-toggle-btn').addEventListener('click', () => {
  filterOpen = !filterOpen
  document.getElementById('filter-body').classList.toggle('open', filterOpen)
  document.getElementById('filter-toggle-btn').textContent = filterOpen ? '▼' : '▲'
})

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

;(async () => {
  await checkAuth()
  await fetchAll()
  populateFilterCategory()
  applyFilter()
})()

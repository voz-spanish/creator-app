const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../login/login.html'
  return session
}

let allMaterials = []

// ===== データ取得 =====
async function fetchAll() {
  const { data, error } = await db
    .from('audio_materials')
    .select(`
      *,
      audio_material_items (
        id,
        audio_number,
        audio_sentences ( id )
      )
    `)
    .order('updated_at', { ascending: false })

  if (!error) allMaterials = data || []
}

// ===== フィルター適用 =====
function applyFilter() {
  const q = document.getElementById('search-input').value.trim().toLowerCase()

  let filtered = [...allMaterials]
  if (q) filtered = filtered.filter(m => m.title?.toLowerCase().includes(q))

  const drafts = filtered.filter(m => m.status === 'draft')
  const saved  = filtered.filter(m => m.status === 'saved')

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

  items.forEach(material => {
    const li = document.createElement('li')
    li.className = `lesson-item ${type === 'draft' ? 'draft' : 'published'}`

    const titleText  = material.title || '（タイトル未設定）'
    const titleClass = material.title ? 'lesson-title' : 'lesson-title untitled'

    // Audio数・Sentence数を集計
    const itemCount    = material.audio_material_items?.length || 0
    const sentCount    = material.audio_material_items?.reduce(
      (sum, item) => sum + (item.audio_sentences?.length || 0), 0
    ) || 0

    const updatedStr = formatDatetime(material.updated_at)
    const typeLabel  = material.type === 'youtube' ? 'YouTube' : material.type

    if (type === 'draft') {
      li.innerHTML = `
        <div class="${titleClass}">${titleText}</div>
        <div class="lesson-meta">最終編集: ${updatedStr}　／　${typeLabel}</div>
        <div class="lesson-meta">Audio ${itemCount}件　Sentence ${sentCount}件</div>
        <div class="lesson-actions">
          <button class="btn-action btn-primary">編集を続ける</button>
          <button class="btn-action btn-delete">削除</button>
        </div>
      `
      li.querySelector('.btn-primary').addEventListener('click', () => {
        window.location.href = `new/new.html?id=${material.id}`
      })
      li.querySelector('.btn-delete').addEventListener('click', () => deleteMaterial(material.id))

    } else {
      li.innerHTML = `
        <div class="${titleClass}">${titleText}</div>
        <div class="lesson-meta">保存日: ${updatedStr}　／　${typeLabel}</div>
        <div class="lesson-meta">Audio ${itemCount}件　Sentence ${sentCount}件</div>
        <div class="lesson-actions">
          <button class="btn-action btn-primary">編集</button>
          <button class="btn-action btn-delete">削除</button>
        </div>
      `
      li.querySelector('.btn-primary').addEventListener('click', () => {
        window.location.href = `new/new.html?id=${material.id}`
      })
      li.querySelector('.btn-delete').addEventListener('click', () => deleteMaterial(material.id))
    }

    list.appendChild(li)
  })
}

// ===== 削除 =====
async function deleteMaterial(id) {
  if (!confirm('この素材を削除しますか？\n（関連するAudio・Sentenceもすべて削除されます）')) return

  // 関連データを順に削除
  const { data: items } = await db
    .from('audio_material_items')
    .select('id')
    .eq('material_id', id)

  if (items && items.length > 0) {
    const itemIds = items.map(i => i.id)
    const { data: sentences } = await db
      .from('audio_sentences')
      .select('id')
      .in('item_id', itemIds)

    if (sentences && sentences.length > 0) {
      const sentIds = sentences.map(s => s.id)
      await db.from('audio_sentence_vocab').delete().in('sentence_id', sentIds)
      await db.from('audio_sentences').delete().in('id', sentIds)
    }
    await db.from('audio_material_items').delete().in('id', itemIds)
  }

  await db.from('audio_materials').delete().eq('id', id)
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

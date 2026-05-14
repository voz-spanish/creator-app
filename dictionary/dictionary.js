const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../login/login.html'
  return session
}

let allEntries = []
let allFormats = []
let allPOS = []
let filterOpen = false

async function fetchAll() {
  const [entriesRes, formatsRes, posRes] = await Promise.all([
    db.from('dictionary_entries').select('*, formats(name), parts_of_speech(name)').order('created_at', { ascending: false }),
    db.from('formats').select('*').order('name'),
    db.from('parts_of_speech').select('*').order('name')
  ])
  if (!entriesRes.error) allEntries = entriesRes.data
  if (!formatsRes.error) allFormats = formatsRes.data
  if (!posRes.error) allPOS = posRes.data
}

function populateFilterFormat() {
  const sel = document.getElementById('filter-format')
  sel.innerHTML = '<option value="">すべて</option>'
  allFormats.forEach(f => {
    sel.innerHTML += `<option value="${f.id}">${f.name}</option>`
  })
}

function getScopeLabel(scope) {
  switch (scope) {
    case 'free': return 'Free'
    case 'plus': return 'Plus'
    case 'max': return 'Max'
    default: return '非公開'
  }
}

function renderList(items) {
  const list = document.getElementById('entry-list')
  const empty = document.getElementById('empty-msg')
  list.innerHTML = ''

  if (items.length === 0) {
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  items.forEach(entry => {
    const li = document.createElement('li')
    li.className = 'entry-item'

    const formatName = entry.formats?.name || ''
    const posName = entry.parts_of_speech?.name || ''

    li.innerHTML = `
      <div class="entry-spanish">${entry.spanish}</div>
      <div class="entry-japanese">${entry.japanese}</div>
      <div class="entry-meta">
        ${formatName ? `<span class="format-badge">${formatName}</span>` : ''}
        ${posName ? `<span class="pos-badge">${posName}</span>` : ''}
        <span class="scope-badge">${getScopeLabel(entry.scope)}</span>
      </div>
      <div class="entry-actions">
        <button class="btn-action btn-confirm">確認</button>
        <button class="btn-action btn-edit">編集</button>
        <button class="btn-action btn-delete">削除</button>
      </div>
    `

    li.querySelector('.btn-confirm').addEventListener('click', () => openDetail(entry))
    li.querySelector('.btn-edit').addEventListener('click', () => openEdit(entry))
    li.querySelector('.btn-delete').addEventListener('click', () => deleteEntry(entry.id))
    list.appendChild(li)
  })
}

function openDetail(entry) {
  const content = document.getElementById('popup-detail-content')
  const formatName = entry.formats?.name || ''
  const posName = entry.parts_of_speech?.name || ''
  const data = entry.word_data || {}

  let html = `
    <div class="entry-meta" style="margin-bottom:8px">
      ${formatName ? `<span class="format-badge">${formatName}</span>` : ''}
      ${posName ? `<span class="pos-badge">${posName}</span>` : ''}
      <span class="scope-badge">${getScopeLabel(entry.scope)}</span>
    </div>
    <div class="detail-spanish">${entry.spanish}</div>
    <div class="detail-japanese">${entry.japanese}</div>
  `

  if (entry.example) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">例文</div>
        <div class="detail-text">${entry.example}</div>
      </div>
    `
  }

  if (entry.hint) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">💡 ヒント</div>
        <div class="detail-text">${entry.hint}</div>
      </div>
    `
  }

  // 名詞：冠詞つき形式
  if (data.noun) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">FORMAS CON ARTÍCULO</div>
        <table class="conjugation-table">
          <tr><th>単数</th><th>複数</th></tr>
          <tr><td>${data.noun.singular || ''}</td><td>${data.noun.plural || ''}</td></tr>
        </table>
      </div>
    `
  }

  // 形容詞：性数変化
  if (data.adjective) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">FORMAS DEL ADJETIVO</div>
        <table class="conjugation-table">
          <tr><th></th><th>単数</th><th>複数</th></tr>
          <tr><td>男性</td><td>${data.adjective.ms || ''}</td><td>${data.adjective.mp || ''}</td></tr>
          <tr><td>女性</td><td>${data.adjective.fs || ''}</td><td>${data.adjective.fp || ''}</td></tr>
        </table>
      </div>
    `
  }

  // 動詞・助動詞：活用表
  if (data.conjugations && data.conjugations.length > 0) {
    const subjects = ['(yo)', '(tú)', '(él / ella / usted)', '(nosotros)', '(ellos / ellas / ustedes)']
    data.conjugations.forEach(tense => {
      if (!tense.rows || tense.rows.length === 0) return
      html += `
        <div class="detail-section">
          <div class="tense-title">${tense.tense}${tense.meaning ? ' — ' + tense.meaning : ''}</div>
          <table class="conjugation-table">
            <tr><th>主語</th><th>活用</th><th>例文</th><th>意味</th></tr>
            ${tense.rows.map((row, i) => `
              <tr>
                <td>${row.subject || subjects[i] || ''}</td>
                <td>${row.form || ''}</td>
                <td>${row.example || ''}</td>
                <td>${row.meaning || ''}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `
    })
  }

  // カスタム活用
  if (data.custom_conjugations && data.custom_conjugations.length > 0) {
    data.custom_conjugations.forEach(tense => {
      if (!tense.rows || tense.rows.length === 0) return
      html += `
        <div class="detail-section">
          <div class="tense-title">${tense.tense}${tense.meaning ? ' — ' + tense.meaning : ''}</div>
          <table class="conjugation-table">
            <tr><th>主語</th><th>活用</th><th>例文</th><th>意味</th></tr>
            ${tense.rows.map(row => `
              <tr>
                <td>${row.subject || ''}</td>
                <td>${row.form || ''}</td>
                <td>${row.example || ''}</td>
                <td>${row.meaning || ''}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `
    })
  }

  content.innerHTML = html
  openPopup('popup-detail-overlay')
}

function openEdit(entry) {
  const formatName = entry.formats?.name || ''
  if (formatName === '単語') {
    window.location.href = `new/word.html?id=${entry.id}`
  } else {
    window.location.href = `new/new.html?id=${entry.id}`
  }
}

async function deleteEntry(id) {
  if (!confirm('この登録を削除しますか？')) return
  await db.from('lookup_forms').delete().eq('entry_id', id)
  await db.from('dictionary_entries').delete().eq('id', id)
  await fetchAll()
  applyFilter()
}

function applyFilter() {
  const q = document.getElementById('search-input').value.trim().toLowerCase()
  const formatId = document.getElementById('filter-format').value

  let filtered = [...allEntries]
  if (q) {
    filtered = filtered.filter(e =>
      e.spanish?.toLowerCase().includes(q) ||
      e.japanese?.toLowerCase().includes(q)
    )
  }
  if (formatId) {
    filtered = filtered.filter(e => e.format_id === formatId)
  }
  renderList(filtered)
}

function openPopup(id) { document.getElementById(id).classList.add('open') }
function closePopup(id) { document.getElementById(id).classList.remove('open') }

document.getElementById('search-input').addEventListener('input', applyFilter)
document.getElementById('filter-format').addEventListener('change', applyFilter)

document.getElementById('filter-toggle-btn').addEventListener('click', () => {
  filterOpen = !filterOpen
  document.getElementById('filter-body').classList.toggle('open', filterOpen)
  document.getElementById('filter-toggle-btn').textContent = filterOpen ? '▼' : '▲'
})

document.getElementById('btn-add').addEventListener('click', () => {
  window.location.href = 'new/new.html'
})

document.getElementById('popup-detail-close').addEventListener('click', () => {
  closePopup('popup-detail-overlay')
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
  populateFilterFormat()
  applyFilter()
})()

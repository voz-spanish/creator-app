const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../login/login.html'
  return session
}

let allQuestions = []
let allCategories = []
let filterOpen = false

async function fetchAll() {
  const [qRes, catRes] = await Promise.all([
    db.from('questions').select('*, question_categories(name)').order('created_at', { ascending: false }),
    db.from('question_categories').select('*').order('name')
  ])
  if (!qRes.error) allQuestions = qRes.data
  if (!catRes.error) allCategories = catRes.data
}

function populateFilterCategory() {
  const sel = document.getElementById('filter-category')
  sel.innerHTML = '<option value="">すべて</option>'
  allCategories.forEach(c => {
    sel.innerHTML += `<option value="${c.id}">${c.name}</option>`
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

function applyFilter() {
  const q = document.getElementById('search-input').value.trim().toLowerCase()
  const catId = document.getElementById('filter-category').value
  const tag = document.getElementById('filter-tag').value.trim().toLowerCase()

  let filtered = [...allQuestions]
  if (q) {
    filtered = filtered.filter(item =>
      item.spanish_display?.toLowerCase().includes(q) ||
      item.japanese?.toLowerCase().includes(q)
    )
  }
  if (catId) filtered = filtered.filter(item => item.category_id === catId)
  if (tag) filtered = filtered.filter(item => item.tags?.some(t => t.toLowerCase().includes(tag)))
  renderList(filtered)
}

function renderList(items) {
  const list = document.getElementById('question-list')
  const empty = document.getElementById('empty-msg')
  list.innerHTML = ''

  if (items.length === 0) {
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  items.forEach(item => {
    const li = document.createElement('li')
    li.className = 'question-item'
    const catName = item.question_categories?.name || ''
    const tagsHtml = (item.tags || []).map(t => `<span class="tag-badge">${t}</span>`).join('')

    li.innerHTML = `
      <div class="question-spanish">${item.spanish_display || item.spanish_raw}</div>
      <div class="question-japanese">${item.japanese || ''}</div>
      <div class="question-meta">
        ${catName ? `<span class="category-badge">${catName}</span>` : ''}
        ${tagsHtml}
        <span class="scope-badge">${getScopeLabel(item.scope)}</span>
      </div>
      <div class="question-actions">
        <button class="btn-action btn-confirm">確認</button>
        <button class="btn-action btn-edit">編集</button>
        <button class="btn-action btn-delete">削除</button>
      </div>
    `

    li.querySelector('.btn-confirm').addEventListener('click', () => openDetail(item))
    li.querySelector('.btn-edit').addEventListener('click', () => {
      window.location.href = `new/new.html?id=${item.id}`
    })
    li.querySelector('.btn-delete').addEventListener('click', () => deleteQuestion(item.id))
    list.appendChild(li)
  })
}

async function openDetail(item) {
  const [vocabRes, grammarRes, hintsRes, answersRes] = await Promise.all([
    db.from('question_vocab').select('*').eq('question_id', item.id).order('sort_order'),
    db.from('question_grammar').select('*').eq('question_id', item.id).order('sort_order'),
    db.from('question_hints').select('*').eq('question_id', item.id).order('sort_order'),
    db.from('answer_examples').select('*').eq('question_id', item.id).order('sort_order')
  ])

  const vocab = vocabRes.data || []
  const grammar = grammarRes.data || []
  const hints = hintsRes.data || []
  const answers = answersRes.data || []

  const content = document.getElementById('popup-detail-content')
  const catName = item.question_categories?.name || ''
  const tagsHtml = (item.tags || []).map(t => `<span class="tag-badge">${t}</span>`).join('')

  let html = `
    <div class="question-meta" style="margin-bottom:8px">
      ${catName ? `<span class="category-badge">${catName}</span>` : ''}
      ${tagsHtml}
      <span class="scope-badge">${getScopeLabel(item.scope)}</span>
    </div>
  `

  // プレビュー（インタラクティブ）
  html += `
    <div class="detail-section" style="border-top:none;padding-top:0">
      <div id="preview-container"></div>
      <div id="meaning-bubble" style="display:none"></div>
    </div>
  `

  if (item.japanese) {
    html += `<div class="detail-japanese">${item.japanese}</div>`
  }

  // 語彙
  if (vocab.length > 0) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">語彙</div>
        ${vocab.map(v => `
          <div class="vocab-item">
            <span class="vocab-spanish">${v.spanish}</span>
            <span class="vocab-meaning">${v.selected_meaning || ''}</span>
          </div>
        `).join('')}
      </div>
    `
  }

  // 文法
  if (grammar.length > 0) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">文法ポイント</div>
        ${grammar.map(g => `
          <div class="grammar-item">
            <div class="grammar-spanish">${g.spanish}</div>
            <div class="grammar-explanation">${g.explanation || ''}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  // ヒント
  if (hints.length > 0) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">💡 ヒント</div>
        ${hints.map(h => `
          <div class="hint-item">
            <span class="vocab-spanish">${h.spanish || ''}</span>
            <span class="vocab-meaning">${h.japanese || ''}</span>
          </div>
        `).join('')}
      </div>
    `
  }

  // 回答例
  if (answers.length > 0) {
    html += `
      <div class="detail-section">
        <div class="detail-section-title">回答例</div>
        ${answers.map(a => `
          <div class="answer-item">
            <div class="answer-level">${a.level === 'simple' ? 'シンプル' : '詳細'}</div>
            <div>${a.content}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  content.innerHTML = html
  openPopup('popup-detail-overlay')

  // プレビュー描画
  renderPreview(item, vocab)
}

function renderPreview(item, vocab) {
  const container = document.getElementById('preview-container')
  const bubble = document.getElementById('meaning-bubble')
  if (!container) return

  const raw = item.spanish_raw || ''
  const tokens = parseTokens(raw)
  const vocabMap = buildVocabMap(vocab)

  container.className = 'preview-wrap'
  container.innerHTML = ''

  let activeToken = null

  tokens.forEach(token => {
    if (token.type === 'space') {
      container.appendChild(document.createTextNode(' '))
      return
    }

    const span = document.createElement('span')
    span.className = `preview-token ${token.type}`
    span.textContent = token.text

    span.addEventListener('click', (e) => {
      e.stopPropagation()

      if (activeToken === span && token.type !== 'phrase') {
        span.classList.remove('active')
        bubble.style.display = 'none'
        activeToken = null
        return
      }

      // 全トークンのactiveを解除
      container.querySelectorAll('.preview-token').forEach(t => t.classList.remove('active'))
      span.classList.add('active')
      activeToken = span

      const meaning = vocabMap[token.text] || vocabMap[normalizeSpanish(token.text)] || ''

      if (token.type === 'phrase') {
        // 塊の中の単語を個別選択可能に
        span.innerHTML = ''
        const innerTokens = token.children || tokenizeWords(token.text)
        innerTokens.forEach((inner, i) => {
          if (i > 0) span.appendChild(document.createTextNode(' '))
          const innerSpan = document.createElement('span')
          innerSpan.className = `preview-token ${inner.type || 'word'}`
          innerSpan.textContent = inner.text
          innerSpan.addEventListener('click', (e2) => {
            e2.stopPropagation()
            container.querySelectorAll('.preview-token').forEach(t => t.classList.remove('active'))
            innerSpan.classList.add('active')
            const innerMeaning = vocabMap[inner.text] || vocabMap[normalizeSpanish(inner.text)] || ''
            showBubble(bubble, inner.text, innerMeaning, container)
          })
          span.appendChild(innerSpan)
        })
      }

      showBubble(bubble, token.text, meaning, container)
    })

    container.appendChild(span)
  })

  // 何もないところをタッチで消す
  container.addEventListener('click', () => {
    container.querySelectorAll('.preview-token').forEach(t => {
      t.classList.remove('active')
      // phraseの中身をリセット
      if (t.classList.contains('phrase')) {
        t.textContent = t.dataset.text || t.textContent
      }
    })
    bubble.style.display = 'none'
    activeToken = null
  })
}

function showBubble(bubble, text, meaning, container) {
  if (!meaning) {
    bubble.style.display = 'none'
    return
  }
  bubble.className = 'preview-meaning-bubble'
  bubble.textContent = `${text} — ${meaning}`
  bubble.style.display = 'inline-block'
  container.parentNode.insertBefore(bubble, container.nextSibling)
}

// トークン解析（記号付きテキストをパース）
function parseTokens(raw) {
  const tokens = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === '[') {
      // フレーズ
      const end = findClosing(raw, i, '[', ']')
      const inner = raw.slice(i + 1, end)
      const text = stripSymbols(inner)
      tokens.push({ type: 'phrase', text, raw: inner, children: parseTokens(inner) })
      i = end + 1
    } else if (raw[i] === '(') {
      // 表現
      const end = findClosing(raw, i, '(', ')')
      const inner = raw.slice(i + 1, end)
      const text = stripSymbols(inner)
      tokens.push({ type: 'expression', text, raw: inner })
      i = end + 1
    } else if (raw[i] === ' ') {
      tokens.push({ type: 'space', text: ' ' })
      i++
    } else {
      // 単語
      let j = i
      while (j < raw.length && raw[j] !== ' ' && raw[j] !== '[' && raw[j] !== ']' && raw[j] !== '(' && raw[j] !== ')') j++
      const text = raw.slice(i, j)
      if (text) tokens.push({ type: 'word', text })
      i = j
    }
  }
  return tokens
}

function findClosing(str, start, open, close) {
  let depth = 0
  for (let i = start; i < str.length; i++) {
    if (str[i] === open) depth++
    if (str[i] === close) { depth--; if (depth === 0) return i }
  }
  return str.length - 1
}

function stripSymbols(str) {
  return str.replace(/[\[\]()]/g, '').trim()
}

function tokenizeWords(text) {
  return text.split(/\s+/).filter(w => w).map(w => ({ type: 'word', text: w }))
}

function buildVocabMap(vocab) {
  const map = {}
  vocab.forEach(v => {
    if (v.spanish && v.selected_meaning) map[v.spanish] = v.selected_meaning
  })
  return map
}

function normalizeSpanish(text) {
  return text.toLowerCase().replace(/[¿?¡!.,;:]/g, '').trim()
}

async function deleteQuestion(id) {
  if (!confirm('この質問を削除しますか？')) return
  await db.from('question_vocab').delete().eq('question_id', id)
  await db.from('question_grammar').delete().eq('question_id', id)
  await db.from('question_hints').delete().eq('question_id', id)
  await db.from('answer_examples').delete().eq('question_id', id)
  await db.from('questions').delete().eq('id', id)
  await fetchAll()
  applyFilter()
}

function openPopup(id) { document.getElementById(id).classList.add('open') }
function closePopup(id) { document.getElementById(id).classList.remove('open') }

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
  populateFilterCategory()
  applyFilter()
})()

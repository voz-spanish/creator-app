const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../../login/login.html'
  return session
}

const params = new URLSearchParams(location.search)
const editId = params.get('id')

let allCategories = []
let allSets = []
let parsedTokens = []
let vocabRows = []
let currentDictVocabIdx = null

async function fetchAll() {
  const [catRes] = await Promise.all([
    db.from('question_categories').select('*').order('name')
  ])
  if (!catRes.error) allCategories = catRes.data
}

function populateCategorySelect() {
  const sel = document.getElementById('input-category')
  sel.innerHTML = '<option value="">選択してください</option>'
  allCategories.forEach(c => {
    sel.innerHTML += `<option value="${c.id}">${c.name}</option>`
  })
}

// カテゴリ追加
document.getElementById('btn-add-category').addEventListener('click', () => {
  const wrap = document.getElementById('new-category-wrap')
  wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none'
})

document.getElementById('btn-save-category').addEventListener('click', async () => {
  const name = document.getElementById('new-category-input').value.trim()
  if (!name) return
  const session = await db.auth.getSession()
  const { data, error } = await db.from('question_categories').insert({
    name, user_id: session.data.session.user.id
  }).select().single()
  if (!error) {
    allCategories.push(data)
    populateCategorySelect()
    document.getElementById('input-category').value = data.id
    document.getElementById('new-category-wrap').style.display = 'none'
    document.getElementById('new-category-input').value = ''
  }
})

// 表示用テキスト生成
document.getElementById('btn-generate-display').addEventListener('click', () => {
  const raw = document.getElementById('input-spanish-raw').value
  const display = stripSymbols(raw)
  document.getElementById('display-preview').textContent = display
})

function stripSymbols(str) {
  return str.replace(/[\[\]()]/g, '').replace(/\s+/g, ' ').trim()
}

// トークン解析
function parseTokens(raw) {
  const tokens = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === '[') {
      const end = findClosing(raw, i, '[', ']')
      const inner = raw.slice(i + 1, end)
      const text = stripSymbols(inner)
      const children = parseInnerTokens(inner)
      tokens.push({ type: 'phrase', text, raw: inner, children })
      i = end + 1
    } else if (raw[i] === '(') {
      const end = findClosing(raw, i, '(', ')')
      const inner = raw.slice(i + 1, end)
      const text = stripSymbols(inner)
      tokens.push({ type: 'expression', text, raw: inner })
      i = end + 1
    } else if (raw[i] === ' ') {
      i++
    } else {
      let j = i
      while (j < raw.length && !' []()'.includes(raw[j])) j++
      const text = raw.slice(i, j)
      if (text) tokens.push({ type: 'word', text })
      i = j
    }
  }
  return tokens
}

function parseInnerTokens(raw) {
  const tokens = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === '(') {
      const end = findClosing(raw, i, '(', ')')
      const inner = raw.slice(i + 1, end)
      const text = stripSymbols(inner)
      tokens.push({ type: 'expression', text, raw: inner })
      i = end + 1
    } else if (raw[i] === ' ') {
      i++
    } else {
      let j = i
      while (j < raw.length && !' ()'.includes(raw[j])) j++
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

// 語彙を自動解析
document.getElementById('btn-parse-vocab').addEventListener('click', async () => {
  const raw = document.getElementById('input-spanish-raw').value.trim()
  if (!raw) return

  parsedTokens = parseTokens(raw)
  vocabRows = []

  // フレーズ・表現・単語を平坦化
  function flattenTokens(tokens, parentText) {
    tokens.forEach(token => {
      vocabRows.push({
        spanish: token.text,
        type: token.type,
        parentText: parentText || null,
        selectedMeaning: '',
        meanings: [],
        dictEntryId: null,
        dictStatus: 'checking'
      })
      if (token.children) {
        flattenTokens(token.children, token.text)
      }
    })
  }
  flattenTokens(parsedTokens, null)

  // vocab_meaningsから既存の意味を取得
  const spanishList = [...new Set(vocabRows.map(r => r.spanish))]
  const { data: existingMeanings } = await db
    .from('vocab_meanings')
    .select('*')
    .in('spanish', spanishList)

  const meaningsMap = {}
  if (existingMeanings) {
    existingMeanings.forEach(m => { meaningsMap[m.spanish] = m.meanings || [] })
  }

  // 辞書登録チェック
  const { data: lookupData } = await db
    .from('lookup_forms')
    .select('form, entry_id, dictionary_entries(id, spanish, japanese)')

  const lookupMap = buildLookupMap(lookupData || [])

  vocabRows.forEach(row => {
    row.meanings = meaningsMap[row.spanish] || []
    row.selectedMeaning = row.meanings[0] || ''
    const dictMatch = checkDictMatch(row.spanish, lookupMap)
    row.dictStatus = dictMatch ? 'registered' : 'unregistered'
    row.dictEntryId = dictMatch?.entry_id || null
  })

  renderVocabList()
  renderPreview()
})

function buildLookupMap(lookupData) {
  const map = {}
  lookupData.forEach(l => {
    const normalized = normalizeSpanish(l.form)
    if (!map[normalized]) map[normalized] = []
    map[normalized].push(l)
  })
  return map
}

function checkDictMatch(spanish, lookupMap) {
  const normalized = normalizeSpanish(spanish)
  if (lookupMap[normalized]) return lookupMap[normalized][0]

  // 冠詞を除去して再チェック
  const withoutArticle = removeArticle(normalized)
  if (withoutArticle !== normalized && lookupMap[withoutArticle]) {
    return lookupMap[withoutArticle][0]
  }
  return null
}

function normalizeSpanish(text) {
  return text.toLowerCase().replace(/[¿?¡!.,;:]/g, '').trim()
}

function removeArticle(text) {
  return text.replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, '').trim()
}

function renderVocabList() {
  const list = document.getElementById('vocab-list')
  list.innerHTML = ''

  vocabRows.forEach((row, idx) => {
    const div = document.createElement('div')
    div.className = 'vocab-row'
    div.dataset.idx = idx

    const typeLabel = row.type === 'phrase' ? 'フレーズ' : row.type === 'expression' ? '表現' : '単語'
    const typeClass = `vocab-type-${row.type}`

    const meaningsOptions = row.meanings.map(m =>
      `<option value="${m}" ${m === row.selectedMeaning ? 'selected' : ''}>${m}</option>`
    ).join('')

    const dictBtnLabel = row.dictStatus === 'registered' ? '確認・編集' :
      row.dictStatus === 'unregistered' ? '新規登録' : '確認中'
    const dictBtnClass = row.dictStatus === 'registered' ? 'registered' :
      row.dictStatus === 'unregistered' ? 'unregistered' : ''

    div.innerHTML = `
      <div class="vocab-spanish-label">
        <span class="vocab-type-badge ${typeClass}">${typeLabel}</span>
        ${row.parentText ? `<span style="font-size:0.7rem;color:var(--muted)">（${row.parentText}内）</span>` : ''}
        <br>${row.spanish}
      </div>
      <div class="vocab-meaning-select">
        <select class="vocab-meaning-sel">
          ${meaningsOptions}
          <option value="__new__">＋ 新しい意味を入力</option>
        </select>
        <input type="text" class="vocab-meaning-input" placeholder="日本語の意味" value="${row.selectedMeaning}" style="display:${row.meanings.length === 0 ? 'block' : 'none'}">
      </div>
      <button class="btn-dict ${dictBtnClass}" data-idx="${idx}">${dictBtnLabel}</button>
    `

    const sel = div.querySelector('.vocab-meaning-sel')
    const input = div.querySelector('.vocab-meaning-input')

    sel.addEventListener('change', async () => {
      if (sel.value === '__new__') {
        input.style.display = 'block'
        input.focus()
        vocabRows[idx].selectedMeaning = ''
      } else {
        input.style.display = 'none'
        vocabRows[idx].selectedMeaning = sel.value
      }
    })

    input.addEventListener('change', async () => {
      const newMeaning = input.value.trim()
      if (!newMeaning) return
      vocabRows[idx].selectedMeaning = newMeaning

      // vocab_meaningsに保存
      await saveVocabMeaning(row.spanish, newMeaning)

      // selectに追加
      const opt = document.createElement('option')
      opt.value = newMeaning
      opt.textContent = newMeaning
      opt.selected = true
      sel.insertBefore(opt, sel.lastElementChild)
      input.style.display = 'none'
    })

    div.querySelector('.btn-dict').addEventListener('click', () => {
      openDictPopup(idx)
    })

    list.appendChild(div)
  })
}

async function saveVocabMeaning(spanish, meaning) {
  const session = await db.auth.getSession()
  const userId = session.data.session.user.id
  const { data: existing } = await db.from('vocab_meanings').select('*').eq('spanish', spanish).single()
  if (existing) {
    const newMeanings = [...new Set([...existing.meanings, meaning])]
    await db.from('vocab_meanings').update({ meanings: newMeanings }).eq('id', existing.id)
  } else {
    await db.from('vocab_meanings').insert({ spanish, meanings: [meaning], user_id: userId })
  }
}

// プレビュー描画
function renderPreview() {
  const wrap = document.getElementById('preview-wrap')
  const bubble = document.getElementById('preview-bubble')
  wrap.innerHTML = ''

  const raw = document.getElementById('input-spanish-raw').value
  if (!raw) return

  const tokens = parseTokens(raw)
  const vocabMap = {}
  vocabRows.forEach(r => { if (r.selectedMeaning) vocabMap[r.spanish] = r.selectedMeaning })

  let activeSpan = null

  function appendToken(token, parent) {
    if (token.type === 'space') {
      parent.appendChild(document.createTextNode(' '))
      return
    }

    const span = document.createElement('span')
    span.className = `preview-token ${token.type}`
    span.textContent = token.text
    span.dataset.text = token.text

    span.addEventListener('click', (e) => {
      e.stopPropagation()

      if (activeSpan) activeSpan.classList.remove('active')
      span.classList.add('active')
      activeSpan = span

      const meaning = vocabMap[token.text] || ''

      if (token.type === 'phrase' && token.children) {
        span.innerHTML = ''
        token.children.forEach((child, ci) => {
          if (ci > 0) span.appendChild(document.createTextNode(' '))
          appendToken(child, span)
        })
      }

      if (meaning) {
        bubble.textContent = `${token.text} — ${meaning}`
        bubble.style.display = 'inline-block'
      } else {
        bubble.style.display = 'none'
      }
    })

    parent.appendChild(span)
  }

  tokens.forEach((token, i) => {
    if (i > 0) wrap.appendChild(document.createTextNode(' '))
    appendToken(token, wrap)
  })

  wrap.addEventListener('click', () => {
    if (activeSpan) activeSpan.classList.remove('active')
    activeSpan = null
    bubble.style.display = 'none'
  })
}

// 辞書ポップアップ
async function openDictPopup(idx) {
  currentDictVocabIdx = idx
  const row = vocabRows[idx]
  document.getElementById('popup-dict-title').textContent = row.spanish
  const content = document.getElementById('popup-dict-content')

  if (row.dictStatus === 'registered' && row.dictEntryId) {
    // 登録済み → 詳細表示
    const { data: entry } = await db.from('dictionary_entries')
      .select('*, formats(name), parts_of_speech(name)')
      .eq('id', row.dictEntryId).single()

    content.innerHTML = entry ? `
      <div style="padding:12px 0">
        <div style="font-size:1.1rem;font-weight:400;margin-bottom:4px">${entry.spanish}</div>
        <div style="font-size:0.85rem;color:var(--muted);margin-bottom:12px">${entry.japanese}</div>
        ${entry.formats?.name ? `<span class="vocab-type-badge vocab-type-word">${entry.formats.name}</span>` : ''}
        ${entry.parts_of_speech?.name ? `<span style="font-size:0.7rem;color:var(--moss);margin-left:6px">${entry.parts_of_speech.name}</span>` : ''}
        ${entry.example ? `<div style="margin-top:12px;font-size:0.85rem;color:var(--text)">${entry.example}</div>` : ''}
      </div>
      <button class="btn-new-dict" onclick="window.open('../../dictionary/new/word.html?id=${entry.id}', '_blank')">辞書で編集する</button>
    ` : '<div style="padding:12px;color:var(--muted)">詳細を取得できませんでした</div>'
  } else {
    // 未登録 → 検索・新規登録
    content.innerHTML = `
      <div class="dict-search-wrap">
        <input type="text" id="dict-search-input" placeholder="原形や日本語で検索" value="${row.spanish}" />
        <button class="btn-save-item" id="dict-search-btn">検索</button>
      </div>
      <div id="dict-search-results"></div>
      <button class="btn-new-dict" id="dict-new-btn">辞書に新規登録する</button>
    `

    document.getElementById('dict-search-btn').addEventListener('click', async () => {
      const q = document.getElementById('dict-search-input').value.trim().toLowerCase()
      if (!q) return
      const { data } = await db.from('dictionary_entries')
        .select('*, formats(name)')
        .or(`spanish.ilike.%${q}%,japanese.ilike.%${q}%`)
        .limit(10)
      renderDictSearchResults(data || [], idx)
    })

    document.getElementById('dict-new-btn').addEventListener('click', () => {
      const format = encodeURIComponent(row.spanish)
      window.open(`../../dictionary/new/word.html?spanish=${format}`, '_blank')
    })

    // 初期検索
    const { data } = await db.from('dictionary_entries')
      .select('*, formats(name)')
      .or(`spanish.ilike.%${row.spanish}%,japanese.ilike.%${row.spanish}%`)
      .limit(10)
    renderDictSearchResults(data || [], idx)
  }

  openPopup('popup-dict-overlay')
}

function renderDictSearchResults(results, idx) {
  const container = document.getElementById('dict-search-results')
  if (!container) return
  if (results.length === 0) {
    container.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:0.85rem">見つかりませんでした</div>'
    return
  }
  container.innerHTML = results.map(r => `
    <div class="dict-result-item">
      <div class="dict-result-spanish">${r.spanish}</div>
      <div class="dict-result-japanese">${r.japanese}</div>
      <button class="btn-link-dict" data-entry-id="${r.id}" data-spanish="${r.spanish}">紐付ける</button>
    </div>
  `).join('')

  container.querySelectorAll('.btn-link-dict').forEach(btn => {
    btn.addEventListener('click', () => {
      vocabRows[idx].dictEntryId = btn.dataset.entryId
      vocabRows[idx].dictStatus = 'registered'
      closePopup('popup-dict-overlay')
      renderVocabList()
    })
  })
}

// 文法追加
document.getElementById('btn-add-grammar').addEventListener('click', () => {
  addGrammarRow()
})

function addGrammarRow(spanish = '', explanation = '') {
  const list = document.getElementById('grammar-list')
  const div = document.createElement('div')
  div.className = 'grammar-row'
  div.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center">
      <input type="text" placeholder="文法・表現（ES）" value="${spanish}" style="flex:1" />
      <button class="btn-row-remove">✕</button>
    </div>
    <textarea placeholder="日本語で説明">${explanation}</textarea>
  `
  div.querySelector('.btn-row-remove').addEventListener('click', () => div.remove())
  list.appendChild(div)
}

// ヒント追加
document.getElementById('btn-add-hint').addEventListener('click', () => {
  addHintRow()
})

function addHintRow(spanish = '', japanese = '') {
  const list = document.getElementById('hint-list')
  const div = document.createElement('div')
  div.className = 'hint-row'
  div.innerHTML = `
    <input type="text" placeholder="ES" value="${spanish}" style="flex:1" />
    <input type="text" placeholder="JP" value="${japanese}" style="flex:1" />
    <button class="btn-row-remove">✕</button>
  `
  div.querySelector('.btn-row-remove').addEventListener('click', () => div.remove())
  list.appendChild(div)
}

// 回答例追加
document.getElementById('btn-add-answer').addEventListener('click', () => {
  addAnswerRow()
})

function addAnswerRow(content = '', level = 'simple') {
  const list = document.getElementById('answer-list')
  const div = document.createElement('div')
  div.className = 'answer-row'
  div.innerHTML = `
    <div class="answer-row-top">
      <select class="answer-level-select">
        <option value="simple" ${level === 'simple' ? 'selected' : ''}>シンプル</option>
        <option value="detailed" ${level === 'detailed' ? 'selected' : ''}>詳細</option>
      </select>
      <button class="btn-row-remove">✕</button>
    </div>
    <textarea placeholder="回答例を入力">${content}</textarea>
  `
  div.querySelector('.btn-row-remove').addEventListener('click', () => div.remove())
  list.appendChild(div)
}

function openPopup(id) { document.getElementById(id).classList.add('open') }
function closePopup(id) { document.getElementById(id).classList.remove('open') }

document.getElementById('popup-dict-close').addEventListener('click', () => closePopup('popup-dict-overlay'))

// 保存
document.getElementById('btn-save').addEventListener('click', async () => {
  const errorMsg = document.getElementById('error-msg')
  errorMsg.textContent = ''

  const spanishRaw = document.getElementById('input-spanish-raw').value.trim()
  if (!spanishRaw) {
    errorMsg.textContent = 'スペイン語を入力してください'
    return
  }

  const btn = document.getElementById('btn-save')
  btn.disabled = true
  btn.textContent = '保存中...'

  const session = await db.auth.getSession()
  const userId = session.data.session.user.id

  const spanishDisplay = stripSymbols(spanishRaw)
  const categoryId = document.getElementById('input-category').value || null
  const tags = document.getElementById('input-tags').value.split(/\s+/).filter(t => t)
  const japanese = document.getElementById('input-japanese').value
  const scope = document.getElementById('input-scope').value

  try {
    let questionId = editId

    if (editId) {
      await db.from('questions').update({
        spanish_raw: spanishRaw,
        spanish_display: spanishDisplay,
        japanese, scope, tags,
        category_id: categoryId
      }).eq('id', editId)

      // 関連データを削除して再登録
      await Promise.all([
        db.from('question_vocab').delete().eq('question_id', editId),
        db.from('question_grammar').delete().eq('question_id', editId),
        db.from('question_hints').delete().eq('question_id', editId),
        db.from('answer_examples').delete().eq('question_id', editId)
      ])
    } else {
      const { data: q, error } = await db.from('questions').insert({
        spanish_raw: spanishRaw,
        spanish_display: spanishDisplay,
        japanese, scope, tags,
        category_id: categoryId,
        user_id: userId
      }).select().single()
      if (error) throw error
      questionId = q.id
    }

    // 語彙保存
    if (vocabRows.length > 0) {
      const vocabData = vocabRows.map((row, i) => ({
        question_id: questionId,
        spanish: row.spanish,
        type: row.type,
        selected_meaning: row.selectedMeaning,
        dictionary_entry_id: row.dictEntryId || null,
        sort_order: i,
        user_id: userId
      }))
      await db.from('question_vocab').insert(vocabData)

      // vocab_meaningsに保存
      for (const row of vocabRows) {
        if (row.selectedMeaning) await saveVocabMeaning(row.spanish, row.selectedMeaning)
      }
    }

    // 文法保存
    const grammarRows = document.querySelectorAll('.grammar-row')
    if (grammarRows.length > 0) {
      const grammarData = [...grammarRows].map((row, i) => ({
        question_id: questionId,
        spanish: row.querySelectorAll('input')[0]?.value || '',
        explanation: row.querySelector('textarea')?.value || '',
        sort_order: i,
        user_id: userId
      })).filter(g => g.spanish)
      if (grammarData.length > 0) await db.from('question_grammar').insert(grammarData)
    }

    // ヒント保存
    const hintRows = document.querySelectorAll('.hint-row')
    if (hintRows.length > 0) {
      const hintData = [...hintRows].map((row, i) => ({
        question_id: questionId,
        spanish: row.querySelectorAll('input')[0]?.value || '',
        japanese: row.querySelectorAll('input')[1]?.value || '',
        sort_order: i,
        user_id: userId
      })).filter(h => h.spanish || h.japanese)
      if (hintData.length > 0) await db.from('question_hints').insert(hintData)
    }

    // 回答例保存
    const answerRows = document.querySelectorAll('.answer-row')
    if (answerRows.length > 0) {
      const answerData = [...answerRows].map((row, i) => ({
        question_id: questionId,
        content: row.querySelector('textarea')?.value || '',
        level: row.querySelector('select')?.value || 'simple',
        sort_order: i,
        user_id: userId
      })).filter(a => a.content)
      if (answerData.length > 0) await db.from('answer_examples').insert(answerData)
    }

    window.location.href = '../question.html'
  } catch (err) {
    console.error('保存エラー:', err)
    errorMsg.textContent = '保存に失敗しました'
    btn.disabled = false
    btn.textContent = '保存する'
  }
})

// 編集モード
async function loadEditData() {
  if (!editId) return
  document.getElementById('page-title').textContent = '質問を編集'
  document.getElementById('btn-save').textContent = '更新する'

  const { data: q } = await db.from('questions').select('*').eq('id', editId).single()
  if (!q) return

  document.getElementById('input-category').value = q.category_id || ''
  document.getElementById('input-tags').value = (q.tags || []).join(' ')
  document.getElementById('input-spanish-raw').value = q.spanish_raw || ''
  document.getElementById('display-preview').textContent = q.spanish_display || ''
  document.getElementById('input-japanese').value = q.japanese || ''
  document.getElementById('input-scope').value = q.scope || 'plus'

  // 語彙
  const { data: vocab } = await db.from('question_vocab').select('*').eq('question_id', editId).order('sort_order')
  if (vocab && vocab.length > 0) {
    parsedTokens = parseTokens(q.spanish_raw || '')
    vocabRows = vocab.map(v => ({
      spanish: v.spanish,
      type: v.type,
      selectedMeaning: v.selected_meaning || '',
      meanings: [v.selected_meaning].filter(Boolean),
      dictEntryId: v.dictionary_entry_id || null,
      dictStatus: v.dictionary_entry_id ? 'registered' : 'unregistered',
      parentText: null
    }))
    renderVocabList()
    renderPreview()
  }

  // 文法
  const { data: grammar } = await db.from('question_grammar').select('*').eq('question_id', editId).order('sort_order')
  if (grammar) grammar.forEach(g => addGrammarRow(g.spanish, g.explanation))

  // ヒント
  const { data: hints } = await db.from('question_hints').select('*').eq('question_id', editId).order('sort_order')
  if (hints) hints.forEach(h => addHintRow(h.spanish, h.japanese))

  // 回答例
  const { data: answers } = await db.from('answer_examples').select('*').eq('question_id', editId).order('sort_order')
  if (answers) answers.forEach(a => addAnswerRow(a.content, a.level))
}

// ドロワー
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
  window.location.href = '../../login/login.html'
})

;(async () => {
  await checkAuth()
  await fetchAll()
  populateCategorySelect()
  if (editId) await loadEditData()
})()

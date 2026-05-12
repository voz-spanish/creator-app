const SUPABASE_URL = 'YOUR_URL'
const SUPABASE_KEY = 'YOUR_KEY'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../../login/login.html'
  return session
}

// URLパラメータ取得
const params = new URLSearchParams(location.search)
const mode = params.get('mode') || 'card'
const presetSetId = params.get('set') || null

let allCards = []
let allCategories = []
let allSets = []
let allTags = []

async function fetchAll() {
  const [cardsRes, catsRes, setsRes] = await Promise.all([
    db.from('cards').select('*').order('created_at', { ascending: false }),
    db.from('categories').select('*').order('name'),
    db.from('flashcard_sets').select('*').order('name')
  ])
  if (!cardsRes.error) allCards = cardsRes.data
  if (!catsRes.error) allCategories = catsRes.data
  if (!setsRes.error) allSets = setsRes.data

  // 全タグを収集
  const tagSet = new Set()
  allCards.forEach(c => (c.tags || []).forEach(t => tagSet.add(t)))
  allTags = [...tagSet].sort()
}

// モードに応じてフォームを切り替え
function initMode() {
  if (mode === 'set') {
    document.getElementById('page-title').textContent = '新規フラッシュカード'
    document.getElementById('form-card').style.display = 'none'
    document.getElementById('form-set').style.display = 'block'
    initSetForm()
  } else {
    document.getElementById('page-title').textContent = '新規カード'
    document.getElementById('form-card').style.display = 'block'
    document.getElementById('form-set').style.display = 'none'
    initCardForm()
  }
}

// カードフォーム初期化
function initCardForm() {
  // フラッシュカード選択チェックボックス
  const wrap = document.getElementById('set-checkboxes')
  wrap.innerHTML = ''
  allSets.forEach(set => {
    const item = document.createElement('div')
    item.className = 'set-checkbox-item'
    item.innerHTML = `
      <input type="checkbox" id="set-${set.id}" value="${set.id}"
        ${presetSetId === set.id ? 'checked' : ''}>
      <label for="set-${set.id}">${set.name}</label>
    `
    wrap.appendChild(item)
  })

  // タグ入力でサジェスト表示
  document.getElementById('card-tags').addEventListener('input', (e) => {
    showTagSuggestions(e.target, 'tag-suggestions', allTags)
  })
}

// セットフォーム初期化
function initSetForm() {
  // カテゴリselect
  const catSelect = document.getElementById('set-category')
  catSelect.innerHTML = '<option value="">カテゴリを選択</option>'
  allCategories.forEach(cat => {
    catSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`
  })

  // カード一覧チェックボックス
  renderCardCheckList('')

  // カード検索
  document.getElementById('set-card-search').addEventListener('input', (e) => {
    renderCardCheckList(e.target.value.trim().toLowerCase())
  })

  // タグサジェスト
  document.getElementById('set-tags').addEventListener('input', (e) => {
    showTagSuggestions(e.target, 'set-tag-suggestions', allTags)
    // タグ入力に合わせてカード一覧を更新
    renderCardCheckList(document.getElementById('set-card-search').value)
  })

  // 折りたたみ
  document.getElementById('collapse-toggle').addEventListener('click', () => {
    const body = document.getElementById('collapse-body')
    const btn = document.getElementById('collapse-toggle')
    const isOpen = body.style.display !== 'none'
    body.style.display = isOpen ? 'none' : 'block'
    btn.textContent = `カードを選んで追加 ${isOpen ? '▼' : '▲'}`
  })

  // カテゴリ追加
  document.getElementById('btn-add-category').addEventListener('click', () => {
    const wrap = document.getElementById('new-category-wrap')
    wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none'
  })

  document.getElementById('btn-save-category').addEventListener('click', async () => {
    const name = document.getElementById('new-category-input').value.trim()
    if (!name) return
    const session = await db.auth.getSession()
    const { data, error } = await db.from('categories').insert({
      name,
      user_id: session.data.session.user.id
    }).select().single()
    if (!error) {
      allCategories.push(data)
      const catSelect = document.getElementById('set-category')
      catSelect.innerHTML += `<option value="${data.id}">${data.name}</option>`
      catSelect.value = data.id
      document.getElementById('new-category-wrap').style.display = 'none'
      document.getElementById('new-category-input').value = ''
    }
  })
}

// カードチェックリスト描画
function renderCardCheckList(q) {
  const list = document.getElementById('card-check-list')
  const setTags = document.getElementById('set-tags').value
    .split(/\s+/).filter(t => t)

  let filtered = allCards
  if (q) {
    filtered = filtered.filter(c =>
      c.spanish?.toLowerCase().includes(q) ||
      c.japanese?.toLowerCase().includes(q) ||
      c.tags?.some(t => t.toLowerCase().includes(q))
    )
  }

  list.innerHTML = ''
  filtered.forEach(card => {
    const hasTag = setTags.length > 0 && card.tags?.some(t => setTags.includes(t))
    const item = document.createElement('li')
    item.className = 'card-check-item'
    item.innerHTML = `
      <input type="checkbox" id="cc-${card.id}" value="${card.id}"
        ${hasTag ? 'checked' : ''}>
      <div class="card-check-item-text">
        <div class="card-check-spanish">${card.spanish}</div>
        <div class="card-check-japanese">${card.japanese}</div>
      </div>
    `
    list.appendChild(item)
  })
}

// タグサジェスト表示
function showTagSuggestions(input, containerId, tags) {
  const container = document.getElementById(containerId)
  const current = input.value.split(/\s+/).filter(t => t)
  const unused = tags.filter(t => !current.includes(t))

  container.innerHTML = ''
  unused.slice(0, 10).forEach(tag => {
    const btn = document.createElement('button')
    btn.className = 'tag-suggestion-item'
    btn.textContent = tag
    btn.type = 'button'
    btn.addEventListener('click', () => {
      const vals = input.value.split(/\s+/).filter(t => t)
      if (!vals.includes(tag)) {
        input.value = [...vals, tag].join(' ') + ' '
        showTagSuggestions(input, containerId, tags)
        if (containerId === 'set-tag-suggestions') {
          renderCardCheckList(document.getElementById('set-card-search').value)
        }
      }
    })
    container.appendChild(btn)
  })
}

// タグ自動紐付け同期
async function syncTagCards(setId, setTags) {
  if (!setTags || setTags.length === 0) return
  const matchingCards = allCards.filter(c =>
    c.tags && c.tags.some(t => setTags.includes(t))
  )
  for (const card of matchingCards) {
    await db.from('flashcard_set_cards').upsert({
      set_id: setId,
      card_id: card.id,
      is_manual: false,
      excluded: false
    }, { onConflict: 'set_id,card_id' })
  }
}

// 保存
document.getElementById('btn-save').addEventListener('click', async () => {
  const errorMsg = document.getElementById('error-msg')
  errorMsg.textContent = ''
  const btn = document.getElementById('btn-save')
  btn.disabled = true
  btn.textContent = '保存中...'

  const session = await db.auth.getSession()
  if (!session.data.session) {
    window.location.href = '../../login/login.html'
    return
  }
  const userId = session.data.session.user.id

  try {
    if (mode === 'card') {
      // カード保存
      const spanish = document.getElementById('card-spanish').value.trim()
      const japanese = document.getElementById('card-japanese').value.trim()
      if (!spanish || !japanese) {
        errorMsg.textContent = 'スペイン語と日本語は必須です'
        btn.disabled = false
        btn.textContent = '保存する'
        return
      }
      const tags = document.getElementById('card-tags').value
        .split(/\s+/).filter(t => t)

      const { data: card, error } = await db.from('cards').insert({
        spanish,
        japanese,
        example: document.getElementById('card-example').value,
        hint: document.getElementById('card-hint').value,
        tags,
        scope: document.getElementById('card-scope').value,
        user_id: userId
      }).select().single()

      if (error) throw error

      // 選択されたフラッシュカードに手動追加
      const checked = document.querySelectorAll('#set-checkboxes input:checked')
      for (const cb of checked) {
        await db.from('flashcard_set_cards').upsert({
          set_id: cb.value,
          card_id: card.id,
          is_manual: true,
          excluded: false
        }, { onConflict: 'set_id,card_id' })
      }

      // タグ自動紐付け：全セットに対して同期
      for (const set of allSets) {
        if (set.tags && set.tags.some(t => tags.includes(t))) {
          await db.from('flashcard_set_cards').upsert({
            set_id: set.id,
            card_id: card.id,
            is_manual: false,
            excluded: false
          }, { onConflict: 'set_id,card_id' })
        }
      }

    } else {
      // フラッシュカード保存
      const name = document.getElementById('set-name').value.trim()
      const categoryId = document.getElementById('set-category').value
      if (!name) {
        errorMsg.textContent = 'フラッシュカード名は必須です'
        btn.disabled = false
        btn.textContent = '保存する'
        return
      }
      const tags = document.getElementById('set-tags').value
        .split(/\s+/).filter(t => t)

      const { data: set, error } = await db.from('flashcard_sets').insert({
        name,
        category_id: categoryId || null,
        tags,
        scope: document.getElementById('set-scope').value,
        user_id: userId
      }).select().single()

      if (error) throw error

      // タグ自動紐付け
      await syncTagCards(set.id, tags)

      // 手動チェックしたカードも追加
      const checked = document.querySelectorAll('#card-check-list input:checked')
      for (const cb of checked) {
        await db.from('flashcard_set_cards').upsert({
          set_id: set.id,
          card_id: cb.value,
          is_manual: true,
          excluded: false
        }, { onConflict: 'set_id,card_id' })
      }
    }

    window.location.href = '../flashcard.html'

  } catch (err) {
    console.error('保存エラー:', err)
    errorMsg.textContent = '保存に失敗しました'
    btn.disabled = false
    btn.textContent = '保存する'
  }
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
document.getElementById('logout-btn').addEventListener('click', async () => {
  await db.auth.signOut()
  window.location.href = '../../login/login.html'
})

// 起動
;(async () => {
  await checkAuth()
  await fetchAll()
  initMode()
})()

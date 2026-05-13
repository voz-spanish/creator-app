const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../login/login.html'
  return session
}

let allCards = []
let allSets = []
let allCategories = []
let selectedSetId = null
let filterOpen = false
let showES = true

// データ取得
async function fetchAll() {
  const [cardsRes, setsRes, catsRes] = await Promise.all([
    db.from('cards').select('*').order('created_at', { ascending: false }),
    db.from('flashcard_sets').select('*').order('created_at', { ascending: false }),
    db.from('categories').select('*').order('name')
  ])
  if (!cardsRes.error) allCards = cardsRes.data
  if (!setsRes.error) allSets = setsRes.data
  if (!catsRes.error) allCategories = catsRes.data
}

// セットに紐づくカードIDを取得
async function fetchSetCardIds(setId) {
  const { data } = await db
    .from('flashcard_set_cards')
    .select('card_id, is_manual, excluded')
    .eq('set_id', setId)
  return data || []
}

// タグ自動紐付けを同期
async function syncTagCards(setId) {
  const set = allSets.find(s => s.id === setId)
  if (!set || !set.tags || set.tags.length === 0) return

  const session = await db.auth.getSession()
  const userId = session.data.session?.user.id

  // このセットのタグにマッチするカードを取得
  const matchingCards = allCards.filter(c =>
    c.tags && c.tags.some(t => set.tags.includes(t))
  )

  // 既存の紐付けを取得
  const existing = await fetchSetCardIds(setId)
  const existingIds = new Set(existing.map(e => e.card_id))
  const excludedIds = new Set(existing.filter(e => e.excluded).map(e => e.card_id))

  // タグマッチするカードで未登録かつ除外されていないものを追加
  for (const card of matchingCards) {
    if (!existingIds.has(card.id) && !excludedIds.has(card.id)) {
      await db.from('flashcard_set_cards').insert({
        set_id: setId,
        card_id: card.id,
        is_manual: false,
        excluded: false
      })
    }
  }
}

// カテゴリのselectを更新
function populateCategorySelects() {
  const filterCat = document.getElementById('filter-category')
  const editSetCat = document.getElementById('edit-set-category')

  filterCat.innerHTML = '<option value="">すべて</option>'
  editSetCat.innerHTML = ''

  allCategories.forEach(cat => {
    filterCat.innerHTML += `<option value="${cat.id}">${cat.name}</option>`
    editSetCat.innerHTML += `<option value="${cat.id}">${cat.name}</option>`
  })
}

// フラッシュカードのselectを更新
function populateSetSelect(categoryId = '') {
  const filterSet = document.getElementById('filter-set')
  filterSet.innerHTML = '<option value="">すべて</option>'
  const filtered = categoryId
    ? allSets.filter(s => s.category_id === categoryId)
    : allSets
  filtered.forEach(s => {
    filterSet.innerHTML += `<option value="${s.id}">${s.name}</option>`
  })
  if (selectedSetId) filterSet.value = selectedSetId
}

// カード一覧描画
async function renderCards() {
  const list = document.getElementById('card-list')
  const empty = document.getElementById('empty-msg')
  const q = document.getElementById('search-input').value.trim().toLowerCase()
  const catId = document.getElementById('filter-category').value
  const setId = document.getElementById('filter-set').value

  list.innerHTML = ''

  let cards = [...allCards]

  // フラッシュカード絞り込み
  if (setId) {
    selectedSetId = setId
    const setCards = await fetchSetCardIds(setId)
    const validIds = new Set(
      setCards.filter(sc => !sc.excluded).map(sc => sc.card_id)
    )
    cards = cards.filter(c => validIds.has(c.id))
    showSetDetail(setId, cards.length)
  } else {
    selectedSetId = null
    document.getElementById('set-detail').style.display = 'none'
  }

  // キーワード絞り込み
  if (q) {
    cards = cards.filter(c =>
      c.spanish?.toLowerCase().includes(q) ||
      c.japanese?.toLowerCase().includes(q) ||
      c.tags?.some(t => t.toLowerCase().includes(q))
    )
  }

  if (cards.length === 0) {
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  cards.forEach(card => {
    const li = document.createElement('li')
    li.className = 'card-item'
    li.dataset.id = card.id

    const tagsHtml = (card.tags || [])
      .map(t => `<span class="tag-badge">${t}</span>`).join('')

    li.innerHTML = `
      <div class="card-item-body">
        <div class="card-spanish">${card.spanish}</div>
        <div class="card-japanese">${card.japanese}</div>
        <div class="card-item-meta">
          <span class="scope-badge">${getScopeLabel(card.scope)}</span>
          ${tagsHtml}
        </div>
      </div>
      <div class="card-item-actions">
        <button class="btn-card-action btn-confirm">確認</button>
        <button class="btn-card-action btn-edit">編集</button>
        <button class="btn-card-action btn-delete">削除</button>
      </div>
      <div class="card-delete-reveal">削除</div>
    `

    // タッチスワイプで削除
    let startX = 0
    li.addEventListener('touchstart', e => { startX = e.touches[0].clientX }, { passive: true })
    li.addEventListener('touchend', e => {
      const diff = startX - e.changedTouches[0].clientX
      if (diff > 60) li.classList.add('swiped')
      else if (diff < -20) li.classList.remove('swiped')
    })

    li.querySelector('.card-delete-reveal').addEventListener('click', () => deleteCard(card.id))
    li.querySelector('.btn-confirm').addEventListener('click', () => openFlip(card))
    li.querySelector('.btn-edit').addEventListener('click', () => openEditCard(card))
    li.querySelector('.btn-delete').addEventListener('click', () => deleteCard(card.id))

    list.appendChild(li)
  })
}

// セット詳細表示
function showSetDetail(setId, count) {
  const set = allSets.find(s => s.id === setId)
  if (!set) return
  const cat = allCategories.find(c => c.id === set.category_id)
  document.getElementById('set-detail-name').textContent = set.name
  document.getElementById('set-detail-meta').textContent = cat ? cat.name : ''
  document.getElementById('set-detail-count').textContent = `${count}枚`
  document.getElementById('set-detail').style.display = 'block'

  document.getElementById('btn-edit-set').onclick = () => openEditSet(set)
  document.getElementById('btn-delete-set').onclick = () => deleteSet(set.id)
  document.getElementById('btn-add-card-to-set').onclick = () => {
    window.location.href = `new/new.html?mode=card&set=${set.id}`
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

// カード削除
async function deleteCard(id) {
  if (!confirm('このカードを削除しますか？')) return
  await db.from('flashcard_set_cards').delete().eq('card_id', id)
  await db.from('cards').delete().eq('id', id)
  await fetchAll()
  renderCards()
}

// セット削除
async function deleteSet(id) {
  if (!confirm('このフラッシュカードを削除しますか？')) return
  await db.from('flashcard_set_cards').delete().eq('set_id', id)
  await db.from('flashcard_sets').delete().eq('id', id)
  document.getElementById('filter-set').value = ''
  selectedSetId = null
  await fetchAll()
  populateSetSelect()
  renderCards()
}

// フリップポップアップ
function openFlip(card) {
  showES = true
  updateFlipContent(card)
  document.getElementById('flip-card-inner').classList.remove('flipped')

  document.getElementById('flip-btn').onclick = () => {
    document.getElementById('flip-card-inner').classList.toggle('flipped')
  }
  document.getElementById('flip-card').onclick = () => {
    document.getElementById('flip-card-inner').classList.toggle('flipped')
  }
  document.getElementById('flip-lang-btn').onclick = () => {
    showES = !showES
    document.getElementById('flip-card-inner').classList.remove('flipped')
    updateFlipContent(card)
  }

  openPopup('popup-flip-overlay')
}

function updateFlipContent(card) {
  if (showES) {
    document.getElementById('flip-front').textContent = card.spanish
    document.getElementById('flip-back').textContent = card.japanese
  } else {
    document.getElementById('flip-front').textContent = card.japanese
    document.getElementById('flip-back').textContent = card.spanish
  }
}

// カード編集ポップアップ
function openEditCard(card) {
  document.getElementById('edit-spanish').value = card.spanish
  document.getElementById('edit-japanese').value = card.japanese
  document.getElementById('edit-example').value = card.example || ''
  document.getElementById('edit-hint').value = card.hint || ''
  document.getElementById('edit-tags').value = (card.tags || []).join(' ')
  document.getElementById('edit-scope').value = card.scope || 'plus'

  document.getElementById('edit-card-save').onclick = async () => {
    const tags = document.getElementById('edit-tags').value
      .split(/\s+/).filter(t => t)

    await db.from('cards').update({
      spanish: document.getElementById('edit-spanish').value.trim(),
      japanese: document.getElementById('edit-japanese').value.trim(),
      example: document.getElementById('edit-example').value,
      hint: document.getElementById('edit-hint').value,
      tags,
      scope: document.getElementById('edit-scope').value
    }).eq('id', card.id)

    // タグ変更後に全セットの自動紐付けを再同期
    for (const set of allSets) await syncTagCards(set.id)

    closePopup('popup-edit-card-overlay')
    await fetchAll()
    renderCards()
  }

  openPopup('popup-edit-card-overlay')
}

// カードチェックリスト描画（編集ポップアップ用）
async function renderEditCardCheckList(q, setId, currentSetTags) {
  const list = document.getElementById('edit-card-check-list')
  const setCards = await fetchSetCardIds(setId)
  const checkedIds = new Set(setCards.filter(sc => !sc.excluded).map(sc => sc.card_id))

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
    const hasTag = currentSetTags.length > 0 && card.tags?.some(t => currentSetTags.includes(t))
    const isChecked = checkedIds.has(card.id) || hasTag
    const item = document.createElement('li')
    item.className = 'card-check-item'
    item.innerHTML = `
      <input type="checkbox" id="ecc-${card.id}" value="${card.id}"
        ${isChecked ? 'checked' : ''}>
      <div class="card-check-item-text">
        <div class="card-check-spanish">${card.spanish}</div>
        <div class="card-check-japanese">${card.japanese}</div>
      </div>
    `
    list.appendChild(item)
  })
}

// セット編集ポップアップ
function openEditSet(set) {
  populateCategorySelects()
  document.getElementById('edit-set-category').value = set.category_id || ''
  document.getElementById('edit-set-name').value = set.name
  document.getElementById('edit-set-tags').value = (set.tags || []).join(' ')
  document.getElementById('edit-set-scope').value = set.scope || 'plus'

  // タグサジェスト
  const allTagSet = new Set()
  allCards.forEach(c => (c.tags || []).forEach(t => allTagSet.add(t)))
  const allTagList = [...allTagSet].sort()

  const tagsInput = document.getElementById('edit-set-tags')
  tagsInput.addEventListener('input', () => {
    const currentTags = tagsInput.value.split(/\s+/).filter(t => t)
    showEditTagSuggestions(allTagList, currentTags)
    renderEditCardCheckList(
      document.getElementById('edit-set-card-search').value.toLowerCase(),
      set.id,
      currentTags
    )
  })

  function showEditTagSuggestions(tags, current) {
    const container = document.getElementById('edit-set-tag-suggestions')
    const unused = tags.filter(t => !current.includes(t))
    container.innerHTML = ''
    unused.slice(0, 10).forEach(tag => {
      const btn = document.createElement('button')
      btn.className = 'tag-suggestion-item'
      btn.textContent = tag
      btn.type = 'button'
      btn.addEventListener('click', () => {
        const vals = tagsInput.value.split(/\s+/).filter(t => t)
        if (!vals.includes(tag)) {
          tagsInput.value = [...vals, tag].join(' ') + ' '
          const newTags = tagsInput.value.split(/\s+/).filter(t => t)
          showEditTagSuggestions(tags, newTags)
          renderEditCardCheckList(
            document.getElementById('edit-set-card-search').value.toLowerCase(),
            set.id,
            newTags
          )
        }
      })
      container.appendChild(btn)
    })
  }

  // 折りたたみ
  const collapseBtn = document.getElementById('edit-collapse-toggle')
  const collapseBody = document.getElementById('edit-collapse-body')
  collapseBtn.onclick = () => {
    const isOpen = collapseBody.style.display !== 'none'
    collapseBody.style.display = isOpen ? 'none' : 'block'
    collapseBtn.textContent = `カードを選んで追加 ${isOpen ? '▼' : '▲'}`
  }

  // カード検索
  document.getElementById('edit-set-card-search').addEventListener('input', (e) => {
    const currentTags = tagsInput.value.split(/\s+/).filter(t => t)
    renderEditCardCheckList(e.target.value.toLowerCase(), set.id, currentTags)
  })

  // 初期描画
  const initialTags = (set.tags || [])
  renderEditCardCheckList('', set.id, initialTags)
  showEditTagSuggestions(allTagList, initialTags)

  // 保存
  document.getElementById('edit-set-save').onclick = async () => {
    const tags = tagsInput.value.split(/\s+/).filter(t => t)
    const name = document.getElementById('edit-set-name').value.trim()
    if (!name) return

    await db.from('flashcard_sets').update({
      name,
      category_id: document.getElementById('edit-set-category').value || null,
      tags,
      scope: document.getElementById('edit-set-scope').value
    }).eq('id', set.id)

    // タグ自動紐付け同期
    await syncTagCards(set.id)

    // 手動チェック状態を反映
    const allCheckboxes = document.querySelectorAll('#edit-card-check-list input[type="checkbox"]')
    for (const cb of allCheckboxes) {
      const cardId = cb.value
      if (cb.checked) {
        await db.from('flashcard_set_cards').upsert({
          set_id: set.id,
          card_id: cardId,
          is_manual: true,
          excluded: false
        }, { onConflict: 'set_id,card_id' })
      } else {
        // チェックを外したものは除外フラグを立てる
        const existing = await db.from('flashcard_set_cards')
          .select('id').eq('set_id', set.id).eq('card_id', cardId).single()
        if (existing.data) {
          await db.from('flashcard_set_cards').update({ excluded: true })
            .eq('set_id', set.id).eq('card_id', cardId)
        }
      }
    }

    closePopup('popup-edit-set-overlay')
    await fetchAll()
    populateSetSelect()
    renderCards()
  }

  openPopup('popup-edit-set-overlay')
}

function openPopup(id) { document.getElementById(id).classList.add('open') }
function closePopup(id) { document.getElementById(id).classList.remove('open') }

// フィルター開閉
document.getElementById('filter-toggle-btn').addEventListener('click', () => {
  filterOpen = !filterOpen
  document.getElementById('filter-body').classList.toggle('open', filterOpen)
  document.getElementById('filter-toggle-btn').textContent = filterOpen ? '▼' : '▲'
})

// 検索・絞り込み
document.getElementById('search-input').addEventListener('input', renderCards)
document.getElementById('filter-category').addEventListener('change', (e) => {
  populateSetSelect(e.target.value)
  renderCards()
})
document.getElementById('filter-set').addEventListener('change', renderCards)

// フッターボタン
document.getElementById('btn-new-card').addEventListener('click', () => {
  window.location.href = 'new/new.html?mode=card'
})
document.getElementById('btn-new-set').addEventListener('click', () => {
  window.location.href = 'new/new.html?mode=set'
})

// ポップアップを閉じる
document.getElementById('popup-flip-close').addEventListener('click', () => closePopup('popup-flip-overlay'))
document.getElementById('popup-edit-card-close').addEventListener('click', () => closePopup('popup-edit-card-overlay'))
document.getElementById('popup-edit-set-close').addEventListener('click', () => closePopup('popup-edit-set-overlay'))

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
  window.location.href = '../login/login.html'
})

// 起動
;(async () => {
  await checkAuth()
  await fetchAll()
  populateCategorySelects()
  populateSetSelect()
  renderCards()
})()

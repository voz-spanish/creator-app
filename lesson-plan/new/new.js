const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ============================================================
// ⚠️ audio_sentences の実際の列名に合わせて、この3行だけ修正してください
// ============================================================
const SENTENCE_FIELD_ES    = 'spanish_display' // スペイン語文の列名（表示用整形テキスト。生テキストなら 'spanish_raw' に変更）
const SENTENCE_FIELD_JP    = 'japanese'        // 日本語訳の列名
const SENTENCE_FIELD_ORDER = 'sort_order'      // 並び順の列名

async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../../login/login.html'
  return session
}

// ===== URLパラメータ（?id= があれば編集継続） =====
const urlParams = new URLSearchParams(window.location.search)
let planId = urlParams.get('id')

// ===== 状態 =====
let currentStep = 1
let planTitle = ''
let publishedLessons = []          // 作成済レッスン一覧（audio_materials）
let selectedOrder = []             // 選択済レッスンのmaterial_id配列（並び順）
let selectedSentences = {}         // { materialId: Set(sentenceId) }
let flashcardEsJp = false
let flashcardJpEs = false

// ============================================================
// データ取得
// ============================================================

async function fetchPublishedLessons() {
  const sentenceCols = SENTENCE_FIELD_ORDER
    ? `id, ${SENTENCE_FIELD_ES}, ${SENTENCE_FIELD_JP}, ${SENTENCE_FIELD_ORDER}`
    : `id, ${SENTENCE_FIELD_ES}, ${SENTENCE_FIELD_JP}`

  const { data, error } = await db
    .from('audio_materials')
    .select(`
      id, title,
      audio_material_items (
        id, audio_number,
        audio_sentences ( ${sentenceCols} )
      )
    `)
    .eq('status', 'saved')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error(error)
    publishedLessons = []
    return
  }

  publishedLessons = (data || []).map(m => ({
    ...m,
    audio_material_items: [...(m.audio_material_items || [])]
      .sort((a, b) => (a.audio_number ?? 0) - (b.audio_number ?? 0))
      .map(item => ({
        ...item,
        audio_sentences: SENTENCE_FIELD_ORDER
          ? [...(item.audio_sentences || [])].sort(
              (a, b) => (a[SENTENCE_FIELD_ORDER] ?? 0) - (b[SENTENCE_FIELD_ORDER] ?? 0)
            )
          : (item.audio_sentences || [])
      }))
  }))
}

async function loadExistingPlan() {
  if (!planId) return

  const { data: plan, error } = await db
    .from('lesson_plan_sets')
    .select('*')
    .eq('id', planId)
    .single()

  if (error || !plan) {
    console.error(error)
    return
  }

  planTitle = plan.title || ''
  flashcardEsJp = !!plan.flashcard_es_jp
  flashcardJpEs = !!plan.flashcard_jp_es
  document.getElementById('s1-title').value = planTitle
  document.getElementById('fc-es-jp').checked = flashcardEsJp
  document.getElementById('fc-jp-es').checked = flashcardJpEs

  const { data: items, error: itemsError } = await db
    .from('lesson_plan_items')
    .select(`
      id, material_id, order_index,
      lesson_plan_sentences ( sentence_id )
    `)
    .eq('plan_id', planId)
    .order('order_index', { ascending: true })

  if (itemsError) {
    console.error(itemsError)
    return
  }

  selectedOrder = []
  selectedSentences = {}
  ;(items || []).forEach(item => {
    selectedOrder.push(item.material_id)
    selectedSentences[item.material_id] = new Set(
      (item.lesson_plan_sentences || []).map(s => s.sentence_id)
    )
  })
}

// ============================================================
// ステップ制御
// ============================================================

function showStep(step) {
  currentStep = step
  document.getElementById('step-1').style.display = step === 1 ? 'block' : 'none'
  document.getElementById('step-2').style.display = step === 2 ? 'block' : 'none'
  document.getElementById('step-3').style.display = step === 3 ? 'block' : 'none'

  ;[1, 2, 3].forEach(n => {
    document.getElementById(`step-${n}-indicator`).classList.toggle('active', n === step)
    document.getElementById(`step-${n}-indicator`).classList.toggle('done', n < step)
  })

  document.getElementById('btn-back-step').style.display = step === 1 ? 'none' : 'inline-block'
  document.getElementById('btn-next-step').style.display = step === 3 ? 'none' : 'inline-block'
  document.getElementById('btn-publish').style.display   = step === 3 ? 'inline-block' : 'none'
  document.getElementById('btn-next-step').textContent   = step === 1 ? '作成をはじめる →' : '次へ →'

  if (step === 2) renderLessonSelectList()
  if (step === 3) renderOrderList()

  window.scrollTo(0, 0)
}

// ============================================================
// Step1: 基本設定
// ============================================================

async function handleStep1Next() {
  const titleInput = document.getElementById('s1-title')
  const errorEl = document.getElementById('s1-error')
  const title = titleInput.value.trim()

  if (!title) {
    errorEl.textContent = 'タイトルを入力してください'
    return
  }
  errorEl.textContent = ''
  planTitle = title

  if (!planId) {
    const { data, error } = await db
      .from('lesson_plan_sets')
      .insert({ title: planTitle, status: 'draft' })
      .select()
      .single()

    if (error || !data) {
      console.error(error)
      errorEl.textContent = '作成に失敗しました。もう一度お試しください'
      return
    }
    planId = data.id
    window.history.replaceState({}, '', `${window.location.pathname}?id=${planId}`)
  } else {
    const { error } = await db
      .from('lesson_plan_sets')
      .update({ title: planTitle, updated_at: new Date().toISOString() })
      .eq('id', planId)

    if (error) {
      console.error(error)
      errorEl.textContent = '更新に失敗しました。もう一度お試しください'
      return
    }
  }

  if (publishedLessons.length === 0) await fetchPublishedLessons()
  showStep(2)
}

// ============================================================
// Step2: レッスン選択
// ============================================================

function getFilteredLessons() {
  const q = document.getElementById('s2-search').value.trim().toLowerCase()
  if (!q) return publishedLessons
  return publishedLessons.filter(m => m.title?.toLowerCase().includes(q))
}

function renderLessonSelectList() {
  const list = document.getElementById('lesson-select-list')
  const empty = document.getElementById('s2-empty')
  const lessons = getFilteredLessons()
  list.innerHTML = ''

  if (lessons.length === 0) {
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  lessons.forEach(material => {
    const allSentenceIds = []
    material.audio_material_items.forEach(item => {
      item.audio_sentences.forEach(s => allSentenceIds.push(s.id))
    })
    const selectedSet = selectedSentences[material.id] || new Set()
    const selectedCount = allSentenceIds.filter(id => selectedSet.has(id)).length

    const card = document.createElement('div')
    card.className = 'lesson-select-card'
    card.dataset.materialId = material.id

    const audioCountTotal = material.audio_material_items.length
    const sentCountTotal = allSentenceIds.length

    card.innerHTML = `
      <div class="lesson-select-header">
        <input type="checkbox" class="chk-master" />
        <div class="lesson-select-title-wrap">
          <div class="lesson-select-title">${material.title || '（タイトル未設定）'}</div>
          <div class="lesson-select-meta">Audio ${audioCountTotal}件　Sentence ${sentCountTotal}件　／　選択中 ${selectedCount}件</div>
        </div>
        <button type="button" class="btn-expand-toggle">▽</button>
      </div>
      <div class="lesson-select-body" style="display:none"></div>
    `

    const masterChk = card.querySelector('.chk-master')
    masterChk.checked = sentCountTotal > 0 && selectedCount === sentCountTotal
    masterChk.indeterminate = selectedCount > 0 && selectedCount < sentCountTotal

    const body = card.querySelector('.lesson-select-body')
    material.audio_material_items.forEach(item => {
      const group = document.createElement('div')
      group.className = 'audio-group'
      group.innerHTML = `<div class="audio-group-label">Audio ${item.audio_number}</div>`

      item.audio_sentences.forEach(sentence => {
        const row = document.createElement('label')
        row.className = 'sentence-row'
        const checked = selectedSet.has(sentence.id)
        row.innerHTML = `
          <input type="checkbox" class="chk-sentence" ${checked ? 'checked' : ''} />
          <span class="sentence-text">
            <span class="sentence-es">${sentence[SENTENCE_FIELD_ES] || ''}</span>
            <span class="sentence-jp">${sentence[SENTENCE_FIELD_JP] || ''}</span>
          </span>
        `
        row.querySelector('.chk-sentence').addEventListener('change', (e) => {
          toggleSentence(material.id, sentence.id, e.target.checked, allSentenceIds, card)
        })
        group.appendChild(row)
      })
      body.appendChild(group)
    })

    card.querySelector('.btn-expand-toggle').addEventListener('click', () => {
      const isOpen = body.style.display !== 'none'
      body.style.display = isOpen ? 'none' : 'block'
      card.querySelector('.btn-expand-toggle').textContent = isOpen ? '▽' : '△'
    })

    masterChk.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedSentences[material.id] = new Set(allSentenceIds)
      } else {
        delete selectedSentences[material.id]
      }
      syncOrderFromSelection()
      renderLessonSelectList()
    })

    list.appendChild(card)
  })
}

function toggleSentence(materialId, sentenceId, checked, allSentenceIds, cardEl) {
  if (!selectedSentences[materialId]) selectedSentences[materialId] = new Set()
  if (checked) {
    selectedSentences[materialId].add(sentenceId)
  } else {
    selectedSentences[materialId].delete(sentenceId)
    if (selectedSentences[materialId].size === 0) delete selectedSentences[materialId]
  }
  syncOrderFromSelection()

  // 展開状態を維持したいので、この1カードだけ状態を更新（全体の再描画はしない）
  const selectedSet = selectedSentences[materialId] || new Set()
  const selectedCount = allSentenceIds.filter(id => selectedSet.has(id)).length
  const masterChk = cardEl.querySelector('.chk-master')
  masterChk.checked = selectedCount === allSentenceIds.length && allSentenceIds.length > 0
  masterChk.indeterminate = selectedCount > 0 && selectedCount < allSentenceIds.length
  cardEl.querySelector('.lesson-select-meta').textContent =
    `Audio ${cardEl.querySelectorAll('.audio-group').length}件　Sentence ${allSentenceIds.length}件　／　選択中 ${selectedCount}件`
}

function syncOrderFromSelection() {
  // 1件以上センテンスが選ばれているレッスンだけをselectedOrderに残す。新規追加分は末尾に追加。
  const activeIds = Object.keys(selectedSentences).filter(id => selectedSentences[id].size > 0)
  selectedOrder = selectedOrder.filter(id => activeIds.includes(id))
  activeIds.forEach(id => {
    if (!selectedOrder.includes(id)) selectedOrder.push(id)
  })
}

function handleStep2Next() {
  const errorEl = document.getElementById('s2-error')
  syncOrderFromSelection()
  if (selectedOrder.length === 0) {
    errorEl.textContent = '1件以上センテンスを選択してください'
    return
  }
  errorEl.textContent = ''
  showStep(3)
}

// ============================================================
// Step3: 並び替え・保存
// ============================================================

function findMaterialById(id) {
  return publishedLessons.find(m => m.id === id)
}

function renderOrderList() {
  const list = document.getElementById('order-list')
  list.innerHTML = ''

  selectedOrder.forEach((materialId, index) => {
    const material = findMaterialById(materialId)
    if (!material) return

    const selectedSet = selectedSentences[materialId] || new Set()
    const sentencesInOrder = []
    material.audio_material_items.forEach(item => {
      item.audio_sentences.forEach(s => {
        if (selectedSet.has(s.id)) sentencesInOrder.push(s)
      })
    })

    const el = document.createElement('div')
    el.className = 'order-item'
    el.innerHTML = `
      <div class="order-item-header">
        <div class="order-num-badge">${index + 1}</div>
        <div class="order-item-title-wrap">
          <div class="order-item-title">${material.title || '（タイトル未設定）'}</div>
          <div class="order-item-meta">選択センテンス ${sentencesInOrder.length}件</div>
        </div>
        <div class="order-move-btns">
          <button type="button" class="btn-move-up" ${index === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="btn-move-down" ${index === selectedOrder.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
      </div>
      <ul class="order-sentence-list">
        ${sentencesInOrder.map(s => `<li class="order-sentence-item">${s[SENTENCE_FIELD_ES] || ''}</li>`).join('')}
      </ul>
    `

    el.querySelector('.btn-move-up').addEventListener('click', () => moveOrderItem(index, -1))
    el.querySelector('.btn-move-down').addEventListener('click', () => moveOrderItem(index, 1))

    list.appendChild(el)
  })
}

function moveOrderItem(index, dir) {
  const target = index + dir
  if (target < 0 || target >= selectedOrder.length) return
  ;[selectedOrder[index], selectedOrder[target]] = [selectedOrder[target], selectedOrder[index]]
  renderOrderList()
}

// ============================================================
// 保存処理（下書き保存・本保存 共通ロジック）
// ============================================================

async function persistPlanItems() {
  // 既存itemsを一旦削除（ON DELETE CASCADEでsentencesも自動削除）→ 現在の選択内容で作り直す
  const { error: delError } = await db.from('lesson_plan_items').delete().eq('plan_id', planId)
  if (delError) {
    console.error(delError)
    return false
  }

  for (let i = 0; i < selectedOrder.length; i++) {
    const materialId = selectedOrder[i]
    const material = findMaterialById(materialId)
    if (!material) continue

    const { data: itemData, error: itemError } = await db
      .from('lesson_plan_items')
      .insert({ plan_id: planId, material_id: materialId, order_index: i })
      .select()
      .single()

    if (itemError || !itemData) {
      console.error(itemError)
      return false
    }

    const selectedSet = selectedSentences[materialId] || new Set()
    const sentenceRows = []
    let sIndex = 0
    material.audio_material_items.forEach(item => {
      item.audio_sentences.forEach(s => {
        if (selectedSet.has(s.id)) {
          sentenceRows.push({
            plan_item_id: itemData.id,
            sentence_id: s.id,
            order_index: sIndex++
          })
        }
      })
    })

    if (sentenceRows.length > 0) {
      const { error: sentError } = await db.from('lesson_plan_sentences').insert(sentenceRows)
      if (sentError) {
        console.error(sentError)
        return false
      }
    }
  }

  return true
}

async function handlePublish() {
  const errorEl = document.getElementById('s3-error')
  errorEl.textContent = ''

  flashcardEsJp = document.getElementById('fc-es-jp').checked
  flashcardJpEs = document.getElementById('fc-jp-es').checked

  const ok = await persistPlanItems()
  if (!ok) {
    errorEl.textContent = '保存に失敗しました。もう一度お試しください'
    return
  }

  const { error } = await db
    .from('lesson_plan_sets')
    .update({
      title: planTitle,
      status: 'saved',
      flashcard_es_jp: flashcardEsJp,
      flashcard_jp_es: flashcardJpEs,
      updated_at: new Date().toISOString()
    })
    .eq('id', planId)

  if (error) {
    console.error(error)
    errorEl.textContent = '保存に失敗しました。もう一度お試しください'
    return
  }

  window.location.href = '../lesson-plan.html'
}

// ============================================================
// イベント
// ============================================================

document.getElementById('btn-next-step').addEventListener('click', () => {
  if (currentStep === 1) handleStep1Next()
  else if (currentStep === 2) handleStep2Next()
})

document.getElementById('btn-back-step').addEventListener('click', () => {
  if (currentStep === 2) showStep(1)
  else if (currentStep === 3) showStep(2)
})

document.getElementById('btn-publish').addEventListener('click', handlePublish)

document.getElementById('s2-search').addEventListener('input', renderLessonSelectList)

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

// ============================================================
// 起動
// ============================================================

;(async () => {
  await checkAuth()
  await fetchPublishedLessons()
  if (planId) await loadExistingPlan()
  showStep(1)
})()

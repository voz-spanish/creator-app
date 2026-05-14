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

let allFormats = []
let allSets = []
let wordFormatId = null

async function fetchAll() {
  const [formatsRes, setsRes] = await Promise.all([
    db.from('formats').select('*').order('name'),
    db.from('flashcard_sets').select('*').order('name')
  ])
  if (!formatsRes.error) allFormats = formatsRes.data
  if (!setsRes.error) allSets = setsRes.data
  wordFormatId = allFormats.find(f => f.name === '単語')?.id || null
}

function populateFormatSelect() {
  const sel = document.getElementById('format-select')
  sel.innerHTML = '<option value="">選択してください</option>'
  allFormats.forEach(f => {
    sel.innerHTML += `<option value="${f.id}">${f.name}</option>`
  })
  sel.innerHTML += `<option value="__add__">＋ フォーマットを追加</option>`
}

function populateSetCheckboxes() {
  const wrap = document.getElementById('set-checkboxes')
  wrap.innerHTML = ''
  allSets.forEach(set => {
    const item = document.createElement('div')
    item.className = 'set-checkbox-item'
    item.innerHTML = `
      <input type="checkbox" id="set-${set.id}" value="${set.id}">
      <label for="set-${set.id}">${set.name}</label>
    `
    wrap.appendChild(item)
  })
}

// フォーマット選択時の表示切り替え
document.getElementById('format-select').addEventListener('change', (e) => {
  const val = e.target.value
  const commonFields = document.getElementById('common-fields')
  const wordRedirect = document.getElementById('word-redirect')
  const btnSave = document.getElementById('btn-save')
  const btnGoWord = document.getElementById('btn-go-word')

  if (val === '__add__') {
    document.getElementById('new-format-wrap').style.display = 'flex'
    commonFields.style.display = 'none'
    btnSave.style.display = 'none'
    btnGoWord.style.display = 'none'
    e.target.value = ''
    return
  }

  if (!val) {
    commonFields.style.display = 'none'
    btnSave.style.display = 'none'
    btnGoWord.style.display = 'none'
    return
  }

  commonFields.style.display = 'flex'
  commonFields.style.flexDirection = 'column'
  commonFields.style.gap = '20px'

  if (val === wordFormatId) {
    wordRedirect.style.display = 'block'
    btnSave.style.display = 'none'
    btnGoWord.style.display = 'block'
  } else {
    wordRedirect.style.display = 'none'
    btnSave.style.display = 'block'
    btnGoWord.style.display = 'none'
  }
})

// カード登録トグル
document.getElementById('toggle-card').addEventListener('change', (e) => {
  document.getElementById('card-fields').style.display = e.target.checked ? 'block' : 'none'
})

// フォーマット追加
document.getElementById('btn-add-format').addEventListener('click', () => {
  const wrap = document.getElementById('new-format-wrap')
  wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none'
})

document.getElementById('btn-save-format').addEventListener('click', async () => {
  const name = document.getElementById('new-format-input').value.trim()
  if (!name) return
  const session = await db.auth.getSession()
  const { data, error } = await db.from('formats').insert({
    name,
    user_id: session.data.session.user.id
  }).select().single()
  if (!error) {
    allFormats.push(data)
    const sel = document.getElementById('format-select')
    const opt = document.createElement('option')
    opt.value = data.id
    opt.textContent = data.name
    sel.insertBefore(opt, sel.lastElementChild)
    sel.value = data.id
    sel.dispatchEvent(new Event('change'))
    document.getElementById('new-format-wrap').style.display = 'none'
    document.getElementById('new-format-input').value = ''
    if (data.name === '単語') wordFormatId = data.id
  }
})

// 単語登録画面へ
document.getElementById('btn-go-word').addEventListener('click', () => {
  const spanish = document.getElementById('input-spanish').value.trim()
  const japanese = document.getElementById('input-japanese').value.trim()
  const example = document.getElementById('input-example').value
  const hint = document.getElementById('input-hint').value
  const scope = document.getElementById('input-scope').value
  const formatId = document.getElementById('format-select').value

  const p = new URLSearchParams({ formatId, spanish, japanese, example, hint, scope })
  window.location.href = `word.html?${p.toString()}`
})

// 保存（単語以外）
document.getElementById('btn-save').addEventListener('click', async () => {
  const errorMsg = document.getElementById('error-msg')
  errorMsg.textContent = ''

  const spanish = document.getElementById('input-spanish').value.trim()
  const japanese = document.getElementById('input-japanese').value.trim()
  const formatId = document.getElementById('format-select').value

  if (!spanish || !japanese) {
    errorMsg.textContent = 'スペイン語と日本語は必須です'
    return
  }

  const btn = document.getElementById('btn-save')
  btn.disabled = true
  btn.textContent = '保存中...'

  const session = await db.auth.getSession()
  const userId = session.data.session.user.id

  try {
    const { data: entry, error } = await db.from('dictionary_entries').insert({
      format_id: formatId,
      spanish,
      japanese,
      example: document.getElementById('input-example').value,
      hint: document.getElementById('input-hint').value,
      scope: document.getElementById('input-scope').value,
      word_data: {},
      user_id: userId
    }).select().single()

    if (error) throw error

    // lookup_forms に登録
    await db.from('lookup_forms').insert({
      entry_id: entry.id,
      form: spanish,
      tense: null,
      description: '見出し語'
    })

    // カード登録
    if (document.getElementById('toggle-card').checked) {
      const tags = document.getElementById('card-tags').value.split(/\s+/).filter(t => t)
      const cardScope = document.getElementById('card-scope').value

      const { data: card, error: cardError } = await db.from('cards').insert({
        spanish,
        japanese,
        example: document.getElementById('input-example').value,
        hint: document.getElementById('input-hint').value,
        tags,
        scope: cardScope,
        user_id: userId
      }).select().single()

      if (!cardError) {
        await db.from('dictionary_entries').update({ card_id: card.id }).eq('id', entry.id)

        const checked = document.querySelectorAll('#set-checkboxes input:checked')
        for (const cb of checked) {
          await db.from('flashcard_set_cards').upsert({
            set_id: cb.value,
            card_id: card.id,
            is_manual: true,
            excluded: false
          }, { onConflict: 'set_id,card_id' })
        }

        // タグ自動紐付け
        const allSetsRes = await db.from('flashcard_sets').select('*')
        for (const set of (allSetsRes.data || [])) {
          if (set.tags && set.tags.some(t => tags.includes(t))) {
            await db.from('flashcard_set_cards').upsert({
              set_id: set.id,
              card_id: card.id,
              is_manual: false,
              excluded: false
            }, { onConflict: 'set_id,card_id' })
          }
        }
      }
    }

    window.location.href = '../dictionary.html'
  } catch (err) {
    console.error('保存エラー:', err)
    errorMsg.textContent = '保存に失敗しました'
    btn.disabled = false
    btn.textContent = '保存する'
  }
})

// 編集モード時のデータ読み込み
async function loadEditData() {
  if (!editId) return
  document.getElementById('page-title').textContent = '編集'
  const { data, error } = await db.from('dictionary_entries')
    .select('*, formats(name), parts_of_speech(name)')
    .eq('id', editId).single()
  if (error || !data) return

  document.getElementById('format-select').value = data.format_id
  document.getElementById('format-select').dispatchEvent(new Event('change'))
  document.getElementById('input-spanish').value = data.spanish
  document.getElementById('input-japanese').value = data.japanese
  document.getElementById('input-example').value = data.example || ''
  document.getElementById('input-hint').value = data.hint || ''
  document.getElementById('input-scope').value = data.scope || 'plus'

  // 保存ボタンを更新に変更
  const btn = document.getElementById('btn-save')
  btn.textContent = '更新する'
  btn.onclick = async () => {
    const errorMsg = document.getElementById('error-msg')
    errorMsg.textContent = ''
    const spanish = document.getElementById('input-spanish').value.trim()
    const japanese = document.getElementById('input-japanese').value.trim()
    if (!spanish || !japanese) {
      errorMsg.textContent = 'スペイン語と日本語は必須です'
      return
    }
    btn.disabled = true
    btn.textContent = '更新中...'
    await db.from('dictionary_entries').update({
      format_id: document.getElementById('format-select').value,
      spanish,
      japanese,
      example: document.getElementById('input-example').value,
      hint: document.getElementById('input-hint').value,
      scope: document.getElementById('input-scope').value
    }).eq('id', editId)
    window.location.href = '../dictionary.html'
  }
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
  populateFormatSelect()
  populateSetCheckboxes()
  if (editId) await loadEditData()
})()

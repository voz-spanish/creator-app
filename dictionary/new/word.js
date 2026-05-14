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

let allPOS = []
let allSets = []
let wordFormatId = null
let selectedPOS = ''
let selectedGender = 'm'

const SUBJECTS = ['(yo)', '(tú)', '(él / ella / usted)', '(nosotros)', '(ellos / ellas / ustedes)']

async function fetchAll() {
  const [posRes, setsRes, formatsRes] = await Promise.all([
    db.from('parts_of_speech').select('*').order('name'),
    db.from('flashcard_sets').select('*').order('name'),
    db.from('formats').select('*')
  ])
  if (!posRes.error) allPOS = posRes.data
  if (!setsRes.error) allSets = setsRes.data
  wordFormatId = formatsRes.data?.find(f => f.name === '単語')?.id || null
}

// URLパラメータから共通項目を復元
function restoreCommonFields() {
  if (editId) return
  document.getElementById('input-spanish').value = params.get('spanish') || ''
  document.getElementById('input-japanese').value = params.get('japanese') || ''
  document.getElementById('input-example').value = params.get('example') || ''
  document.getElementById('input-hint').value = params.get('hint') || ''
  document.getElementById('input-scope').value = params.get('scope') || 'plus'
}

// 品詞select
function populatePOSSelect() {
  const sel = document.getElementById('pos-select')
  sel.innerHTML = '<option value="">選択してください</option>'
  allPOS.forEach(p => {
    sel.innerHTML += `<option value="${p.name}">${p.name}</option>`
  })
}

// フラッシュカードチェックボックス
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

// カードトグル
document.getElementById('toggle-card').addEventListener('change', (e) => {
  document.getElementById('card-fields').style.display = e.target.checked ? 'block' : 'none'
})

// 品詞追加
document.getElementById('btn-add-pos').addEventListener('click', () => {
  const wrap = document.getElementById('new-pos-wrap')
  wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none'
})

document.getElementById('btn-save-pos').addEventListener('click', async () => {
  const name = document.getElementById('new-pos-input').value.trim()
  const baseType = document.getElementById('new-pos-basetype').value
  if (!name) return
  const session = await db.auth.getSession()
  const { data, error } = await db.from('parts_of_speech').insert({
    name, base_type: baseType,
    user_id: session.data.session.user.id
  }).select().single()
  if (!error) {
    allPOS.push(data)
    populatePOSSelect()
    document.getElementById('pos-select').value = data.name
    document.getElementById('pos-select').dispatchEvent(new Event('change'))
    document.getElementById('new-pos-wrap').style.display = 'none'
    document.getElementById('new-pos-input').value = ''
  }
})

// 品詞選択
document.getElementById('pos-select').addEventListener('change', (e) => {
  selectedPOS = e.target.value
  renderPOSFields(selectedPOS)
})

// ===== 品詞ごとのフィールド描画 =====
function renderPOSFields(pos) {
  const container = document.getElementById('pos-fields')
  container.innerHTML = ''
  if (!pos) return

  const posData = allPOS.find(p => p.name === pos)
  const baseType = posData?.base_type || pos

  switch (baseType) {
    case '名詞': renderNounFields(container); break
    case '冠詞': renderArticleFields(container); break
    case '形容詞': renderAdjectiveFields(container); break
    case '代名詞': renderPronounFields(container); break
    case '動詞': renderVerbFields(container); break
    case '助動詞': renderAuxVerbFields(container); break
    default: break
  }
}

// ===== 名詞 =====
function renderNounFields(container) {
  const block = document.createElement('div')
  block.className = 'section-block'
  block.innerHTML = `
    <div class="section-title">FORMAS CON ARTÍCULO</div>
    <div class="field">
      <label>性別</label>
      <div class="gender-select-wrap">
        <button class="gender-btn active" id="gender-m" type="button">男性 (el)</button>
        <button class="gender-btn" id="gender-f" type="button">女性 (la)</button>
      </div>
    </div>
    <div class="field">
      <label>単数 Singular</label>
      <input type="text" id="noun-singular" placeholder="例: el casa" />
    </div>
    <div class="field">
      <label>複数 Plural</label>
      <input type="text" id="noun-plural" placeholder="例: las casas" />
    </div>
    <button class="btn-auto" id="btn-noun-auto" type="button">✨ 自動生成</button>
  `
  container.appendChild(block)

  document.getElementById('gender-m').addEventListener('click', () => {
    selectedGender = 'm'
    document.getElementById('gender-m').classList.add('active')
    document.getElementById('gender-f').classList.remove('active')
    autoNoun()
  })
  document.getElementById('gender-f').addEventListener('click', () => {
    selectedGender = 'f'
    document.getElementById('gender-f').classList.add('active')
    document.getElementById('gender-m').classList.remove('active')
    autoNoun()
  })
  document.getElementById('input-spanish').addEventListener('input', autoNoun)
  document.getElementById('btn-noun-auto').addEventListener('click', autoNoun)
  autoNoun()
}

function autoNoun() {
  const word = document.getElementById('input-spanish').value.trim()
  if (!word) return
  const art = selectedGender === 'm' ? 'el' : 'la'
  const arts = selectedGender === 'm' ? 'los' : 'las'
  const plural = word.endsWith('z')
    ? word.slice(0, -1) + 'ces'
    : word.match(/[aeiouáéíóú]$/i)
      ? word + 'ses'
      : word + 's'
  document.getElementById('noun-singular').value = `${art} ${word}`
  document.getElementById('noun-plural').value = `${arts} ${plural}`
}

// ===== 冠詞 =====
const DEFINITE_USAGE = `定冠詞の使い方
① すでに話に出たもの
Vi un perro. El perro era grande.（犬を見た → その犬）

② お互いにわかってるもの
Cierra la puerta（そのドア閉めて）

③ 世界に一つ・常識的に特定できる
el sol（太陽）/ la luna（月）

④ 一般的なもの（英語と違うポイント）
Los perros son inteligentes（犬は賢い）

⑤ 曜日・時間・習慣
el lunes（月曜日に）/ Voy al gym los lunes（毎週月曜）

⑥ 体の部位
Me duele la cabeza（頭が痛い）`

const INDEFINITE_USAGE = `不定冠詞の使い方
① 初めて出るもの

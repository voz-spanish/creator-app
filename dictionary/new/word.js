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
Vi un perro（ある犬を見た）

② どれでもいい・特定しない
Quiero una casa（家が欲しい）

③ 「いくつか」
Tengo unos amigos（何人か友達がいる）

④ 「だいたい」「約」
Llegaron unos 20 estudiantes（20人くらい）`

function renderArticleFields(container) {
  const block = document.createElement('div')
  block.className = 'section-block'
  block.innerHTML = `
    <div class="section-title">冠詞の種類</div>
    <div class="field">
      <div class="pronoun-subtypes">
        <button class="subtype-btn active" data-type="definite" type="button">定冠詞</button>
        <button class="subtype-btn" data-type="indefinite" type="button">不定冠詞</button>
      </div>
    </div>
    <div id="article-forms"></div>
    <div class="field" style="margin-top:12px">
      <label>使い方</label>
      <textarea id="article-usage" style="min-height:200px"></textarea>
    </div>
  `
  container.appendChild(block)

  let articleType = 'definite'
  document.getElementById('article-usage').value = DEFINITE_USAGE

  block.querySelectorAll('.subtype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      block.querySelectorAll('.subtype-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      articleType = btn.dataset.type
      renderArticleForms(articleType)
      document.getElementById('article-usage').value =
        articleType === 'definite' ? DEFINITE_USAGE : INDEFINITE_USAGE
    })
  })

  renderArticleForms('definite')
}

function renderArticleForms(type) {
  const forms = document.getElementById('article-forms')
  const items = type === 'definite'
    ? [['ms', '男性・単数', 'el'], ['fs', '女性・単数', 'la'], ['mp', '男性・複数', 'los'], ['fp', '女性・複数', 'las']]
    : [['ms', '男性・単数', 'un'], ['fs', '女性・単数', 'una'], ['mp', '男性・複数', 'unos'], ['fp', '女性・複数', 'unas']]

  forms.innerHTML = `<div class="article-checks">${items.map(([id, label, def]) => `
    <div class="article-check-item">
      <input type="checkbox" id="art-${id}" checked>
      <label for="art-${id}">${def} — ${label}</label>
    </div>
  `).join('')}</div>`
}

// ===== 形容詞 =====
function renderAdjectiveFields(container) {
  const block = document.createElement('div')
  block.className = 'section-block'
  block.innerHTML = `
    <div class="section-title">FORMAS DEL ADJETIVO</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label>男性・単数</label><input type="text" id="adj-ms" /></div>
      <div class="field"><label>男性・複数</label><input type="text" id="adj-mp" /></div>
      <div class="field"><label>女性・単数</label><input type="text" id="adj-fs" /></div>
      <div class="field"><label>女性・複数</label><input type="text" id="adj-fp" /></div>
    </div>
  `
  container.appendChild(block)

  document.getElementById('input-spanish').addEventListener('input', () => {
    if (document.getElementById('pos-select').value === '形容詞') autoAdjective()
  })
  autoAdjective()
}

function autoAdjective() {
  const word = document.getElementById('input-spanish').value.trim()
  if (!word) return
  let ms = word, mp = '', fs = '', fp = ''
  if (word.endsWith('o')) {
    mp = word.slice(0, -1) + 'os'
    fs = word.slice(0, -1) + 'a'
    fp = word.slice(0, -1) + 'as'
  } else if (word.endsWith('e') || word.endsWith('a')) {
    mp = word + 's'
    fs = word
    fp = word + 's'
  } else {
    mp = word + 'es'
    fs = word
    fp = word + 'es'
  }
  const msEl = document.getElementById('adj-ms')
  const mpEl = document.getElementById('adj-mp')
  const fsEl = document.getElementById('adj-fs')
  const fpEl = document.getElementById('adj-fp')
  if (msEl) { msEl.value = ms; mpEl.value = mp; fsEl.value = fs; fpEl.value = fp }
}

// ===== 代名詞 =====
function renderPronounFields(container) {
  const block = document.createElement('div')
  block.className = 'section-block'
  block.innerHTML = `
    <div class="section-title">代名詞の種類</div>
    <div class="pronoun-subtypes">
      ${['人称代名詞','目的格代名詞','再帰代名詞','指示代名詞','所有代名詞','関係代名詞','不定代名詞']
        .map(t => `<button class="subtype-btn" data-type="${t}" type="button">${t}</button>`).join('')}
    </div>
    <div class="field" style="margin-top:12px">
      <label>サブタイプメモ（任意）</label>
      <textarea id="pronoun-memo" placeholder="使い方や説明など"></textarea>
    </div>
  `
  container.appendChild(block)
  block.querySelectorAll('.subtype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      block.querySelectorAll('.subtype-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })
}

// ===== 動詞 =====
const VERB_TENSES = [
  { key: 'present', name: '現在形', meaning: 'Presente' },
  { key: 'ira', name: 'ir a + 不定詞', meaning: '近未来' },
  { key: 'estar', name: 'estar + 現在分詞', meaning: '進行形' },
  { key: 'preterite', name: '点過去', meaning: 'Pretérito' },
  { key: 'imperative', name: '命令形', meaning: 'Imperativo' },
  { key: 'imperfect', name: '線過去', meaning: 'Imperfecto' },
  { key: 'perfect', name: '現在完了', meaning: 'Perfecto' },
  { key: 'subjunctive', name: '接続法', meaning: 'Subjuntivo' },
  { key: 'future', name: '未来形', meaning: 'Futuro' },
  { key: 'conditional', name: '条件形', meaning: 'Condicional' },
]

const AUX_TENSES = [
  { key: 'present', name: '現在形', meaning: 'Presente' },
  { key: 'preterite', name: '点過去', meaning: 'Pretérito' },
  { key: 'imperfect', name: '線過去', meaning: 'Imperfecto' },
  { key: 'conditional', name: '条件形', meaning: 'Condicional' },
]

function renderVerbFields(container) {
  renderConjugationFields(container, VERB_TENSES, '動詞')
}

function renderAuxVerbFields(container) {
  renderConjugationFields(container, AUX_TENSES, '助動詞')
}

function renderConjugationFields(container, tenses, type) {
  const wrap = document.createElement('div')
  wrap.className = 'section-block conjugation-section'
  wrap.id = 'conjugation-wrap'

  tenses.forEach(t => {
    wrap.appendChild(createTenseBlock(t.key, t.name, t.meaning, type))
  })

  // カスタム時制追加ボタン
  const addBtn = document.createElement('button')
  addBtn.className = 'btn-add-tense'
  addBtn.type = 'button'
  addBtn.textContent = '＋ 活用形を追加する'
  addBtn.addEventListener('click', () => {
    const key = 'custom_' + Date.now()
    const block = createTenseBlock(key, '', '', type, true)
    wrap.insertBefore(block, addBtn)
  })
  wrap.appendChild(addBtn)
  container.appendChild(wrap)

  // スペイン語入力で自動推定
  document.getElementById('input-spanish').addEventListener('input', () => {
    if (['動詞', '助動詞'].includes(document.getElementById('pos-select').value)) {
      autoVerbAll(type)
    }
  })
}

function createTenseBlock(key, name, meaning, type, isCustom = false) {
  const block = document.createElement('div')
  block.className = 'tense-block open'
  block.dataset.key = key

  const nameInput = isCustom
    ? `<input type="text" class="tense-name-input" placeholder="時制・文型名" style="background:none;border:none;border-bottom:1px solid var(--earth);outline:none;font-size:0.82rem;color:var(--text);padding:2px 4px;width:120px">`
    : `<span class="tense-name">${name}</span>`

  const meaningInput = isCustom
    ? `<input type="text" class="tense-meaning-input" placeholder="意味" style="background:none;border:none;border-bottom:1px solid var(--earth);outline:none;font-size:0.72rem;color:var(--muted);padding:2px 4px;width:80px">`
    : `<span class="tense-meaning">${meaning}</span>`

  block.innerHTML = `
    <div class="tense-header">
      <div class="tense-header-left">
        ${nameInput}${meaningInput}
      </div>
      <div class="tense-actions">
        <button class="btn-auto btn-tense-auto" type="button" style="padding:4px 10px;font-size:0.7rem">✨ 自動</button>
        <button class="btn-tense-delete" type="button">全削除</button>
        <span class="tense-toggle-icon">▼</span>
      </div>
    </div>
    <div class="tense-body">
      <div class="conjugation-rows" id="rows-${key}"></div>
      <button class="btn-add-row" type="button">＋ 行を追加</button>
    </div>
  `

  // 折りたたみ
  block.querySelector('.tense-header').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return
    block.classList.toggle('open')
  })

  // 全削除
  block.querySelector('.btn-tense-delete').addEventListener('click', () => {
    if (confirm(`「${name || key}」の活用をすべて削除しますか？`)) block.remove()
  })

  // 自動推定
  block.querySelector('.btn-tense-auto').addEventListener('click', () => {
    autoVerbTense(key, type)
  })

  // 行追加
  block.querySelector('.btn-add-row').addEventListener('click', () => {
    addConjugationRow(key, type, null, '', '', '', '')
  })

  // デフォルト行を追加
  SUBJECTS.forEach((subj, i) => {
    addConjugationRow(key, type, subj, '', '', '', '', i)
  })

  return block
}

function addConjugationRow(tenseKey, type, subject, form, fixedPre, example, meaning, idx) {
  const rowsEl = document.getElementById(`rows-${tenseKey}`)
  if (!rowsEl) return

  const row = document.createElement('div')
  row.className = 'conjugation-row'

  if (tenseKey === 'ira') {
    row.classList.add('ira-row')
    row.innerHTML = `
      <div class="row-label">${subject || ''}</div>
      <div class="row-fixed">${getIraFixed(idx)}</div>
      <input type="text" placeholder="動詞の原形" class="row-infinitive" value="${form || ''}" />
      <textarea placeholder="例文(ES)" class="row-example">${example || ''}</textarea>
      <input type="text" placeholder="意味(JP)" class="row-meaning" value="${meaning || ''}" />
    `
  } else if (tenseKey === 'estar') {
    row.classList.add('estar-row')
    row.innerHTML = `
      <div class="row-label">${subject || ''}</div>
      <div class="row-fixed">${getEstarFixed(idx)}</div>
      <input type="text" placeholder="現在分詞 (-ndo)" class="row-gerund" value="${form || ''}" />
      <textarea placeholder="例文(ES)" class="row-example">${example || ''}</textarea>
      <input type="text" placeholder="意味(JP)" class="row-meaning" value="${meaning || ''}" />
    `
  } else if (tenseKey === 'perfect') {
    row.classList.add('haber-row')
    row.innerHTML = `
      <div class="row-label">${subject || ''}</div>
      <div class="row-fixed">${getHaberFixed(idx)}</div>
      <input type="text" placeholder="過去分詞 (-ado/-ido)" class="row-participle" value="${form || ''}" />
      <textarea placeholder="例文(ES)" class="row-example">${example || ''}</textarea>
      <input type="text" placeholder="意味(JP)" class="row-meaning" value="${meaning || ''}" />
    `
  } else {
    row.classList.add('full-row')
    row.innerHTML = `
      <div class="row-label">${subject || ''}</div>
      <input type="text" placeholder="活用形" class="row-form" value="${form || ''}" />
      <textarea placeholder="例文(ES)" class="row-example">${example || ''}</textarea>
      <input type="text" placeholder="意味(JP)" class="row-meaning" value="${meaning || ''}" />
    `
  }

  // 行削除ボタン
  const delBtn = document.createElement('button')
  delBtn.className = 'btn-row-delete'
  delBtn.type = 'button'
  delBtn.textContent = '✕'
  delBtn.addEventListener('click', () => row.remove())
  row.appendChild(delBtn)

  rowsEl.appendChild(row)
}

function getIraFixed(i) {
  return ['voy a', 'vas a', 'va a', 'vamos a', 'van a'][i] || 'va a'
}
function getEstarFixed(i) {
  return ['estoy', 'estás', 'está', 'estamos', 'están'][i] || 'está'
}
function getHaberFixed(i) {
  return ['he', 'has', 'ha', 'hemos', 'han'][i] || 'ha'
}

// ===== 自動推定（全時制） =====
function autoVerbAll(type) {
  const tenses = type === '助動詞' ? AUX_TENSES : VERB_TENSES
  tenses.forEach(t => autoVerbTense(t.key, type))
}

function autoVerbTense(key, type) {
  const verb = document.getElementById('input-spanish').value.trim()
  if (!verb) return

  const forms = getVerbForms(verb, key)
  if (!forms) return

  const rowsEl = document.getElementById(`rows-${key}`)
  if (!rowsEl) return

  const rows = rowsEl.querySelectorAll('.conjugation-row')
  forms.forEach((form, i) => {
    const row = rows[i]
    if (!row) return
    const formInput = row.querySelector('.row-form, .row-infinitive, .row-gerund, .row-participle')
    if (formInput && !formInput.value) formInput.value = form
    else if (formInput) formInput.value = form
  })
}

function getVerbForms(verb, tenseKey) {
  const stem = verb.slice(0, -2)
  const ending = verb.slice(-2)

  const irregulars = {
    ser: {
      present: ['soy','eres','es','somos','son'],
      preterite: ['fui','fuiste','fue','fuimos','fueron'],
      imperfect: ['era','eras','era','éramos','eran'],
      subjunctive: ['sea','seas','sea','seamos','sean'],
      future: ['seré','serás','será','seremos','serán'],
      conditional: ['sería','serías','sería','seríamos','serían'],
      imperative: ['-','sé','sea','seamos','sean'],
    },
    ir: {
      present: ['voy','vas','va','vamos','van'],
      preterite: ['fui','fuiste','fue','fuimos','fueron'],
      imperfect: ['iba','ibas','iba','íbamos','iban'],
      subjunctive: ['vaya','vayas','vaya','vayamos','vayan'],
      future: ['iré','irás','irá','iremos','irán'],
      conditional: ['iría','irías','iría','iríamos','irían'],
      imperative: ['-','ve','vaya','vayamos','vayan'],
    },
    tener: {
      present: ['tengo','tienes','tiene','tenemos','tienen'],
      preterite: ['tuve','tuviste','tuvo','tuvimos','tuvieron'],
      future: ['tendré','tendrás','tendrá','tendremos','tendrán'],
      conditional: ['tendría','tendrías','tendría','tendríamos','tendrían'],
    },
    hacer: {
      present: ['hago','haces','hace','hacemos','hacen'],
      preterite: ['hice','hiciste','hizo','hicimos','hicieron'],
      future: ['haré','harás','hará','haremos','harán'],
      conditional: ['haría','harías','haría','haríamos','harían'],
    },
    poder: {
      future: ['podré','podrás','podrá','podremos','podrán'],
      conditional: ['podría','podrías','podría','podríamos','podrían'],
    },
    venir: {
      future: ['vendré','vendrás','vendrá','vendremos','vendrán'],
      conditional: ['vendría','vendrías','vendría','vendríamos','vendrían'],
    },
    ver: {
      imperfect: ['veía','veías','veía','veíamos','veían'],
    }
  }

  if (irregulars[verb]?.[tenseKey]) return irregulars[verb][tenseKey]

  switch (tenseKey) {
    case 'present':
      if (ending === 'ar') return [`${stem}o`,`${stem}as`,`${stem}a`,`${stem}amos`,`${stem}an`]
      if (ending === 'er') return [`${stem}o`,`${stem}es`,`${stem}e`,`${stem}emos`,`${stem}en`]
      if (ending === 'ir') return [`${stem}o`,`${stem}es`,`${stem}e`,`${stem}imos`,`${stem}en`]
      break
    case 'ira':
      return [verb, verb, verb, verb, verb]
    case 'estar':
      if (ending === 'ar') return Array(5).fill(`${stem}ando`)
      return Array(5).fill(`${stem}iendo`)
    case 'preterite':
      if (ending === 'ar') return [`${stem}é`,`${stem}aste`,`${stem}ó`,`${stem}amos`,`${stem}aron`]
      return [`${stem}í`,`${stem}iste`,`${stem}ió`,`${stem}imos`,`${stem}ieron`]
    case 'imperfect':
      if (ending === 'ar') return [`${stem}aba`,`${stem}abas`,`${stem}aba`,`${stem}ábamos`,`${stem}aban`]
      return [`${stem}ía`,`${stem}ías`,`${stem}ía`,`${stem}íamos`,`${stem}ían`]
    case 'perfect':
      if (ending === 'ar') return Array(5).fill(`${stem}ado`)
      return Array(5).fill(`${stem}ido`)
    case 'subjunctive':
      if (ending === 'ar') return [`${stem}e`,`${stem}es`,`${stem}e`,`${stem}emos`,`${stem}en`]
      return [`${stem}a`,`${stem}as`,`${stem}a`,`${stem}amos`,`${stem}an`]
    case 'future':
      return [`${verb}é`,`${verb}ás`,`${verb}á`,`${verb}emos`,`${verb}án`]
    case 'conditional':
      return [`${verb}ía`,`${verb}ías`,`${verb}ía`,`${verb}íamos`,`${verb}ían`]
    case 'imperative':
      if (ending === 'ar') return ['-',`${stem}a`,`${stem}e`,`${stem}emos`,`${stem}en`]
      return ['-',`${stem}e`,`${stem}a`,`${stem}amos`,`${stem}an`]
  }
  return null
}

// ===== word_dataを収集 =====
function collectWordData() {
  const posName = document.getElementById('pos-select').value
  const posData = allPOS.find(p => p.name === posName)
  const baseType = posData?.base_type || posName
  const data = {}

  if (baseType === '名詞') {
    data.noun = {
      gender: selectedGender,
      singular: document.getElementById('noun-singular')?.value || '',
      plural: document.getElementById('noun-plural')?.value || ''
    }
  }

  if (baseType === '形容詞') {
    data.adjective = {
      ms: document.getElementById('adj-ms')?.value || '',
      mp: document.getElementById('adj-mp')?.value || '',
      fs: document.getElementById('adj-fs')?.value || '',
      fp: document.getElementById('adj-fp')?.value || ''
    }
  }

  if (baseType === '代名詞') {
    const activeBtn = document.querySelector('.subtype-btn.active')
    data.pronoun = {
      subtype: activeBtn?.dataset.type || '',
      memo: document.getElementById('pronoun-memo')?.value || ''
    }
  }

  if (baseType === '冠詞') {
    const activeBtn = document.querySelector('.subtype-btn.active')
    data.article = {
      type: activeBtn?.dataset.type || 'definite',
      usage: document.getElementById('article-usage')?.value || ''
    }
  }

  if (baseType === '動詞' || baseType === '助動詞') {
    const tenses = baseType === '助動詞' ? AUX_TENSES : VERB_TENSES
    const conjugations = []
    const customConjugations = []

    document.querySelectorAll('#conjugation-wrap .tense-block').forEach(block => {
      const key = block.dataset.key
      const isCustom = key.startsWith('custom_')
      const tenseName = isCustom
        ? block.querySelector('.tense-name-input')?.value || ''
        : tenses.find(t => t.key === key)?.name || key
      const tenseMeaning = isCustom
        ? block.querySelector('.tense-meaning-input')?.value || ''
        : tenses.find(t => t.key === key)?.meaning || ''

      const rows = []
      block.querySelectorAll('.conjugation-row').forEach((row, i) => {
        const subject = row.querySelector('.row-label')?.textContent || SUBJECTS[i] || ''
        const form = row.querySelector('.row-form, .row-infinitive, .row-gerund, .row-participle')?.value || ''
        const example = row.querySelector('.row-example')?.value || ''
        const meaning = row.querySelector('.row-meaning')?.value || ''
        if (form || example) rows.push({ subject, form, example, meaning })
      })

      if (rows.length > 0) {
        const entry = { tense: tenseName, meaning: tenseMeaning, rows }
        if (isCustom) customConjugations.push(entry)
        else conjugations.push(entry)
      }
    })

    data.conjugations = conjugations
    data.custom_conjugations = customConjugations
  }

  return data
}

// ===== lookup_formsを収集 =====
function collectLookupForms(entryId, spanish, wordData) {
  const forms = [{ entry_id: entryId, form: spanish, tense: null, description: '見出し語' }]
  const posName = document.getElementById('pos-select').value
  const posData = allPOS.find(p => p.name === posName)
  const baseType = posData?.base_type || posName

  if (baseType === '名詞' && wordData.noun) {
    if (wordData.noun.singular) forms.push({ entry_id: entryId, form: wordData.noun.singular, tense: null, description: '単数（冠詞付き）' })
    if (wordData.noun.plural) forms.push({ entry_id: entryId, form: wordData.noun.plural, tense: null, description: '複数（冠詞付き）' })
  }

  if (baseType === '形容詞' && wordData.adjective) {
    Object.entries(wordData.adjective).forEach(([k, v]) => {
      if (v) forms.push({ entry_id: entryId, form: v, tense: null, description: `形容詞(${k})` })
    })
  }

  if ((baseType === '動詞' || baseType === '助動詞') && wordData.conjugations) {
    wordData.conjugations.forEach(tense => {
      tense.rows?.forEach(row => {
        if (row.form) forms.push({ entry_id: entryId, form: row.form, tense: tense.tense, description: `${tense.tense} ${row.subject}` })
      })
    })
    wordData.custom_conjugations?.forEach(tense => {
      tense.rows?.forEach(row => {
        if (row.form) forms.push({ entry_id: entryId, form: row.form, tense: tense.tense, description: `${tense.tense} ${row.subject}` })
      })
    })
  }

  return forms
}

// ===== 保存 =====
document.getElementById('btn-save').addEventListener('click', async () => {
  const errorMsg = document.getElementById('error-msg')
  errorMsg.textContent = ''

  const spanish = document.getElementById('input-spanish').value.trim()
  const japanese = document.getElementById('input-japanese').value.trim()
  const posName = document.getElementById('pos-select').value

  if (!spanish || !japanese) {
    errorMsg.textContent = 'スペイン語と日本語は必須です'
    return
  }

  const btn = document.getElementById('btn-save')
  btn.disabled = true
  btn.textContent = '保存中...'

  const session = await db.auth.getSession()
  const userId = session.data.session.user.id
  const posData = allPOS.find(p => p.name === posName)
  const wordData = collectWordData()

  try {
    let entryId = editId

    if (editId) {
      await db.from('dictionary_entries').update({
        spanish, japanese,
        example: document.getElementById('input-example').value,
        hint: document.getElementById('input-hint').value,
        scope: document.getElementById('input-scope').value,
        pos_id: posData?.id || null,
        word_data: wordData
      }).eq('id', editId)
      await db.from('lookup_forms').delete().eq('entry_id', editId)
    } else {
      const { data: entry, error } = await db.from('dictionary_entries').insert({
        format_id: wordFormatId,
        spanish, japanese,
        example: document.getElementById('input-example').value,
        hint: document.getElementById('input-hint').value,
        scope: document.getElementById('input-scope').value,
        pos_id: posData?.id || null,
        word_data: wordData,
        user_id: userId
      }).select().single()
      if (error) throw error
      entryId = entry.id
    }

    // lookup_forms保存
    const lookupForms = collectLookupForms(entryId, spanish, wordData)
    if (lookupForms.length > 0) {
      await db.from('lookup_forms').insert(lookupForms)
    }

    // カード登録
    if (!editId && document.getElementById('toggle-card').checked) {
      const tags = document.getElementById('card-tags').value.split(/\s+/).filter(t => t)
      const { data: card, error: cardError } = await db.from('cards').insert({
        spanish, japanese,
        example: document.getElementById('input-example').value,
        hint: document.getElementById('input-hint').value,
        tags,
        scope: document.getElementById('card-scope').value,
        user_id: userId
      }).select().single()

      if (!cardError) {
        await db.from('dictionary_entries').update({ card_id: card.id }).eq('id', entryId)
        const checked = document.querySelectorAll('#set-checkboxes input:checked')
        for (const cb of checked) {
          await db.from('flashcard_set_cards').upsert({
            set_id: cb.value, card_id: card.id,
            is_manual: true, excluded: false
          }, { onConflict: 'set_id,card_id' })
        }
        const allSetsRes = await db.from('flashcard_sets').select('*')
        for (const set of (allSetsRes.data || [])) {
          if (set.tags && set.tags.some(t => tags.includes(t))) {
            await db.from('flashcard_set_cards').upsert({
              set_id: set.id, card_id: card.id,
              is_manual: false, excluded: false
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

// 編集モード
async function loadEditData() {
  if (!editId) return
  document.getElementById('page-title').textContent = '単語を編集'
  document.getElementById('btn-save').textContent = '更新する'

  const { data, error } = await db.from('dictionary_entries')
    .select('*').eq('id', editId).single()
  if (error || !data) return

  document.getElementById('input-spanish').value = data.spanish
  document.getElementById('input-japanese').value = data.japanese
  document.getElementById('input-example').value = data.example || ''
  document.getElementById('input-hint').value = data.hint || ''
  document.getElementById('input-scope').value = data.scope || 'plus'

  if (data.pos_id) {
    const pos = allPOS.find(p => p.id === data.pos_id)
    if (pos) {
      document.getElementById('pos-select').value = pos.name
      selectedPOS = pos.name
      renderPOSFields(pos.name)
    }
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
  populatePOSSelect()
  populateSetCheckboxes()
  restoreCommonFields()
  if (editId) await loadEditData()
})()

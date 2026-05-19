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
let lessonId = params.get('id')
let currentStep = parseInt(params.get('step') || '1')
let ytPlayer = null
let ytReady = false
let allCategories = []
let audioBlocks = []
let currentDictVocabInfo = null

// ===== YouTube IFrame API =====
window.onYouTubeIframeAPIReady = () => {
  ytReady = true
  ytPlayer = new YT.Player('youtube-player', {
    height: '100%', width: '100%',
    videoId: '',
    playerVars: { playsinline: 1, rel: 0 },
    events: {
      onReady: () => {
        const savedId = document.getElementById('yt-id-input').value
        if (savedId) ytPlayer.loadVideoById(savedId)
      }
    }
  })
}

function loadYouTubeAPI() {
  if (document.getElementById('yt-api-script')) return
  const tag = document.createElement('script')
  tag.id = 'yt-api-script'
  tag.src = 'https://www.youtube.com/iframe_api'
  document.head.appendChild(tag)
}

// ===== ステップ管理 =====
function showStep(step) {
  currentStep = step
  ;[1, 2, 3].forEach(s => {
    document.getElementById(`step-${s}`).style.display = s === step ? 'block' : 'none'
    const ind = document.getElementById(`step-${s}-indicator`)
    ind.classList.toggle('active', s === step)
    ind.classList.toggle('done', s < step)
  })
  document.getElementById('btn-back-step').style.display = step > 1 ? 'block' : 'none'
  document.getElementById('btn-next-step').style.display = step < 3 ? 'block' : 'none'
  document.getElementById('btn-publish').style.display = step === 3 ? 'block' : 'none'

  if (step === 2) loadYouTubeAPI()
  if (step === 3) syncStep3()

  const toggleBtn = document.getElementById('btn-toggle-player')
  if (toggleBtn) {
    toggleBtn.style.display = step === 2 ? 'flex' : 'none'
  }
}

// ===== Step 1 =====
async function initStep1() {
  if (!lessonId) {
    const session = await db.auth.getSession()
    const userId = session.data.session.user.id
    const { data, error } = await db.from('lessons').insert({
      title: '',
      type: 'youtube',
      status: 'draft',
      user_id: userId
    }).select().single()
    if (!error) lessonId = data.id
  } else {
    const { data } = await db.from('lessons').select('*').eq('id', lessonId).single()
    if (data) {
      document.getElementById('s1-title').value = data.title || ''
      const radios = document.querySelectorAll('input[name="lesson-type"]')
      radios.forEach(r => { if (r.value === data.type) r.checked = true })
    }
  }
}

async function saveStep1() {
  const title = document.getElementById('s1-title').value.trim()
  const type = document.querySelector('input[name="lesson-type"]:checked')?.value || 'youtube'
  await db.from('lessons').update({
    title, type,
    updated_at: new Date().toISOString()
  }).eq('id', lessonId)
}

document.getElementById('s1-title').addEventListener('blur', async () => {
  if (!lessonId) return
  await saveStep1()
})

// ===== Step 2: YouTube =====
document.getElementById('btn-load-yt').addEventListener('click', async () => {
  const id = document.getElementById('yt-id-input').value.trim()
  if (!id || !ytPlayer) return
  ytPlayer.loadVideoById(id)
  await db.from('lessons').update({
    youtube_id: id,
    updated_at: new Date().toISOString()
  }).eq('id', lessonId)
})

// ===== Audioブロック =====
async function loadAudioBlocks() {
  const { data: audios } = await db.from('lesson_audios')
    .select('*').eq('lesson_id', lessonId).order('sort_order')
  if (!audios || audios.length === 0) return

  for (const audio of audios) {
    const { data: sentences } = await db.from('lesson_sentences')
      .select('*').eq('audio_id', audio.id).order('sort_order')
    audioBlocks.push({ ...audio, sentences: sentences || [] })
    renderAudioBlock(audioBlocks.length - 1)
  }
  updateAudioCurrentLabel()
}

document.getElementById('btn-add-audio').addEventListener('click', async () => {
  const audioNum = audioBlocks.length + 1
  const { data, error } = await db.from('lesson_audios').insert({
    lesson_id: lessonId,
    audio_number: audioNum,
    start_sec: 0,
    end_sec: null,
    sort_order: audioBlocks.length
  }).select().single()
  if (!error) {
    audioBlocks.push({ ...data, sentences: [] })
    renderAudioBlock(audioBlocks.length - 1)
    updateAudioCurrentLabel()
  }
})

function updateAudioCurrentLabel() {
  const label = document.getElementById('audio-current-label')
  if (audioBlocks.length === 0) {
    label.textContent = ''
    return
  }
  const last = audioBlocks[audioBlocks.length - 1]
  const start = formatSec(last.start_sec || 0)
  const end = last.end_sec != null ? formatSec(last.end_sec) : '未設定'
  label.textContent = `▶ Audio ${last.audio_number}  ${start} — ${end}`
}

// ===== 秒数フォーマット（0.01秒対応） =====
function formatSec(sec) {
  const totalSec = parseFloat(sec) || 0
  const m = Math.floor(totalSec / 60)
  const s = (totalSec % 60).toFixed(2)
  return `${m}:${String(s).padStart(5, '0')}`
}

function renderAudioBlock(idx) {
  const audio = audioBlocks[idx]
  const container = document.getElementById('audio-blocks')

  const block = document.createElement('div')
  block.className = 'audio-block'
  block.id = `audio-block-${idx}`

  const startStr = formatSec(audio.start_sec || 0)
  const endStr = audio.end_sec != null ? formatSec(audio.end_sec) : '未設定'

  block.innerHTML = `
    <div class="audio-block-header">
      <span class="audio-block-title">Audio ${audio.audio_number}</span>
      <span class="audio-block-range">${startStr} — ${endStr}</span>
    </div>
    <div class="audio-block-body">
      <div class="sec-input-row">
        <div class="sec-input-wrap">
          <label>開始秒</label>
          <input type="number" class="audio-start" min="0" step="0.01" value="${audio.start_sec || 0}" />
        </div>
        <button class="btn-mark btn-mark-start">▶ ここから</button>
        <div class="sec-input-wrap">
          <label>終了秒</label>
          <input type="number" class="audio-end" min="0" step="0.01" value="${audio.end_sec ?? ''}" placeholder="未設定" />
        </div>
        <button class="btn-mark btn-mark-end">■ ここまで</button>
        <button class="btn-play-range">▶ 再生</button>
      </div>

      <div class="section-card-title" style="font-size:0.68rem;letter-spacing:0.2em;color:var(--muted)">
        センテンス入力（/ で区切ると複数に分割）
      </div>
      <div class="input-hint-text">
        単語: そのまま　( ) : 表現（細分化なし）　[ ] : フレーズ（細分化あり）　/ / : センテンス区切り
      </div>
      <textarea class="audio-text-input" placeholder="例: /¿Qué hiciste hoy?/ /¿Qué comiste?/" rows="3"></textarea>
      <button class="btn-auto btn-parse-sentences">✨ センテンスを解析</button>

      <div class="sentences-wrap" id="sentences-${idx}"></div>
    </div>
  `

  if (audio.sentences && audio.sentences.length > 0) {
    audio.sentences.forEach((sent, si) => {
      renderSentenceBlock(idx, si, sent)
    })
  }

  // ▶ ここから（0.01秒対応）
  block.querySelector('.btn-mark-start').addEventListener('click', async () => {
    if (!ytPlayer) return
    const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(2))
    block.querySelector('.audio-start').value = sec
    audioBlocks[idx].start_sec = sec
    await saveAudioRange(idx)
    updateAudioBlockHeader(idx)
    updateAudioCurrentLabel()
  })

  // ■ ここまで（0.01秒対応）
  block.querySelector('.btn-mark-end').addEventListener('click', async () => {
    if (!ytPlayer) return
    const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(2))
    block.querySelector('.audio-end').value = sec
    audioBlocks[idx].end_sec = sec
    await saveAudioRange(idx)
    updateAudioBlockHeader(idx)
    updateAudioCurrentLabel()
  })

  // 再生
  block.querySelector('.btn-play-range').addEventListener('click', () => {
    if (!ytPlayer) return
    const start = audioBlocks[idx].start_sec || 0
    const end = audioBlocks[idx].end_sec
    ytPlayer.seekTo(start, true)
    ytPlayer.playVideo()
    if (end) {
      setTimeout(() => ytPlayer.pauseVideo(), (end - start) * 1000)
    }
  })

  // 秒数手動入力（0.01秒対応）
  block.querySelector('.audio-start').addEventListener('change', async (e) => {
    audioBlocks[idx].start_sec = parseFloat(e.target.value) || 0
    await saveAudioRange(idx)
    updateAudioBlockHeader(idx)
  })
  block.querySelector('.audio-end').addEventListener('change', async (e) => {
    audioBlocks[idx].end_sec = e.target.value ? parseFloat(e.target.value) : null
    await saveAudioRange(idx)
    updateAudioBlockHeader(idx)
  })

  // センテンス解析
  block.querySelector('.btn-parse-sentences').addEventListener('click', async () => {
    const raw = block.querySelector('.audio-text-input').value.trim()
    if (!raw) return
    const sentences = parseSentences(raw)
    const sentWrap = document.getElementById(`sentences-${idx}`)
    sentWrap.innerHTML = ''
    audioBlocks[idx].sentences = []

    for (let si = 0; si < sentences.length; si++) {
      const sent = sentences[si]
      const display = stripSymbols(sent)
      const { data, error } = await db.from('lesson_sentences').insert({
        audio_id: audio.id,
        lesson_id: lessonId,
        sentence_number: si + 1,
        spanish_raw: sent,
        spanish_display: display,
        sort_order: si
      }).select().single()
      if (!error) {
        audioBlocks[idx].sentences.push(data)
        renderSentenceBlock(idx, si, data)
      }
    }
  })

  container.appendChild(block)
}

function parseSentences(raw) {
  const parts = raw.split('/')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  return parts.length > 0 ? parts : [raw]
}

function stripSymbols(str) {
  return str.replace(/[\[\]()\/]/g, '').replace(/\s+/g, ' ').trim()
}

function renderSentenceBlock(audioIdx, sentIdx, sent) {
  const wrap = document.getElementById(`sentences-${audioIdx}`)
  const block = document.createElement('div')
  block.className = 'sentence-block'
  block.id = `sentence-${sent.id}`

  block.innerHTML = `
    <div class="sentence-label">センテンス ${sentIdx + 1}</div>
    <button class="btn-sentence-delete">✕</button>

    <div class="sentence-sec-row">
      <div class="sec-input-wrap">
        <label>開始秒（任意）</label>
        <input type="number" class="sent-start" min="0" step="0.01" value="${sent.start_sec ?? ''}" placeholder="未設定" style="width:88px" />
      </div>
      <button class="btn-mark btn-mark-start sent-mark-start" style="font-size:0.7rem;padding:6px 8px">▶ ここから</button>
      <div class="sec-input-wrap">
        <label>終了秒（任意）</label>
        <input type="number" class="sent-end" min="0" step="0.01" value="${sent.end_sec ?? ''}" placeholder="未設定" style="width:88px" />
      </div>
      <button class="btn-mark btn-mark-end sent-mark-end" style="font-size:0.7rem;padding:6px 8px">■ ここまで</button>
      <button class="btn-play-range sent-play" style="font-size:0.7rem;padding:5px 10px">▶</button>
    </div>

    <div class="field">
      <div class="input-hint-text">[ ] フレーズ　( ) 表現　/ / センテンス区切り</div>
      <div class="display-preview">${sent.spanish_display || ''}</div>
    </div>

    <div class="field">
      <label>日本語意味（任意）</label>
      <textarea class="sent-japanese" rows="2" placeholder="日本語の意味">${sent.japanese || ''}</textarea>
    </div>

    <button class="btn-vocab">語彙を登録する</button>

    <div class="preview-wrap sent-preview" id="preview-${sent.id}">
      <span style="color:var(--muted);font-size:0.8rem">語彙登録後にプレビューが表示されます</span>
    </div>
    <div class="preview-meaning-bubble" id="bubble-${sent.id}" style="display:none"></div>
  `

  // 削除
  block.querySelector('.btn-sentence-delete').addEventListener('click', async () => {
    if (!confirm('このセンテンスを削除しますか？')) return
    await db.from('lesson_sentence_vocab').delete().eq('sentence_id', sent.id)
    await db.from('lesson_sentences').delete().eq('id', sent.id)
    block.remove()
  })

  // 秒数マーク（0.01秒対応）
  block.querySelector('.sent-mark-start').addEventListener('click', async () => {
    if (!ytPlayer) return
    const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(2))
    block.querySelector('.sent-start').value = sec
    await db.from('lesson_sentences').update({ start_sec: sec }).eq('id', sent.id)
  })
  block.querySelector('.sent-mark-end').addEventListener('click', async () => {
    if (!ytPlayer) return
    const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(2))
    block.querySelector('.sent-end').value = sec
    await db.from('lesson_sentences').update({ end_sec: sec }).eq('id', sent.id)
  })

  // 再生（0.01秒対応）
  block.querySelector('.sent-play').addEventListener('click', () => {
    if (!ytPlayer) return
    const start = parseFloat(block.querySelector('.sent-start').value) || audioBlocks[audioIdx].start_sec || 0
    const end = parseFloat(block.querySelector('.sent-end').value) || audioBlocks[audioIdx].end_sec
    ytPlayer.seekTo(start, true)
    ytPlayer.playVideo()
    if (end) setTimeout(() => ytPlayer.pauseVideo(), (end - start) * 1000)
  })

  // 日本語自動保存
  block.querySelector('.sent-japanese').addEventListener('blur', async (e) => {
    await db.from('lesson_sentences').update({
      japanese: e.target.value
    }).eq('id', sent.id)
  })

  // 語彙登録
  block.querySelector('.btn-vocab').addEventListener('click', () => {
    openVocabPopup(sent)
  })

  wrap.appendChild(block)
}

async function saveAudioRange(idx) {
  const audio = audioBlocks[idx]
  await db.from('lesson_audios').update({
    start_sec: audio.start_sec,
    end_sec: audio.end_sec
  }).eq('id', audio.id)
}

function updateAudioBlockHeader(idx) {
  const audio = audioBlocks[idx]
  const block = document.getElementById(`audio-block-${idx}`)
  if (!block) return
  const rangeEl = block.querySelector('.audio-block-range')
  const startStr = formatSec(audio.start_sec || 0)
  const endStr = audio.end_sec != null ? formatSec(audio.end_sec) : '未設定'
  rangeEl.textContent = `${startStr} — ${endStr}`
}

// ===== 語彙ポップアップ =====
async function openVocabPopup(sent) {
  document.getElementById('popup-vocab-title').textContent = sent.spanish_display || sent.spanish_raw
  const content = document.getElementById('popup-vocab-content')
  content.innerHTML = '<div style="color:var(--muted);padding:12px">読み込み中...</div>'
  openPopup('popup-vocab-overlay')

  const { data: existingVocab } = await db.from('lesson_sentence_vocab')
    .select('*').eq('sentence_id', sent.id).order('sort_order')

  const { data: lookupData } = await db.from('lookup_forms')
    .select('form, entry_id, dictionary_entries(id, spanish, japanese)')

  const lookupMap = buildLookupMap(lookupData || [])

  const raw = sent.spanish_raw || ''
  const tokens = parseTokens(raw)
  const flatTokens = flattenTokens(tokens)
  const spanishList = [...new Set(flatTokens.map(t => t.text))]

  const { data: meanings } = await db.from('vocab_meanings')
    .select('*').in('spanish', spanishList)
  const meaningsMap = {}
  if (meanings) meanings.forEach(m => { meaningsMap[m.spanish] = m.meanings || [] })

  const existingMap = {}
  if (existingVocab) existingVocab.forEach(v => { existingMap[v.spanish] = v })

  content.innerHTML = ''
  const vocabItems = []

  flatTokens.forEach((token, i) => {
    const existing = existingMap[token.text]
    const ms = meaningsMap[token.text] || []
    const selectedMeaning = existing?.selected_meaning || ms[0] || ''
    const dictMatch = checkDictMatch(token.text, lookupMap)
    const dictStatus = dictMatch ? 'registered' : 'unregistered'

    const row = document.createElement('div')
    row.className = 'vocab-row'
    const typeLabel = token.type === 'phrase' ? 'フレーズ' : token.type === 'expression' ? '表現' : '単語'
    const typeClass = `vocab-type-${token.type}`
    const msOptions = ms.map(m => `<option value="${m}" ${m === selectedMeaning ? 'selected' : ''}>${m}</option>`).join('')

    row.innerHTML = `
      <div class="vocab-spanish-label">
        <span class="vocab-type-badge ${typeClass}">${typeLabel}</span>
        <br>${token.text}
        ${token.parentText ? `<span style="font-size:0.65rem;color:var(--muted)">（${token.parentText}内）</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <select class="vocab-meaning-sel" style="font-size:0.82rem;padding:6px 10px">
          ${msOptions}
          <option value="__new__">＋ 新しい意味</option>
        </select>
        <input type="text" class="vocab-meaning-input" placeholder="日本語の意味" value="${selectedMeaning}" style="font-size:0.82rem;padding:6px 10px;display:${ms.length === 0 ? 'block' : 'none'}">
      </div>
      <button class="btn-dict ${dictStatus}" data-idx="${i}">${dictStatus === 'registered' ? '確認・編集' : '新規登録'}</button>
    `

    const sel = row.querySelector('.vocab-meaning-sel')
    const input = row.querySelector('.vocab-meaning-input')

    sel.addEventListener('change', () => {
      if (sel.value === '__new__') {
        input.style.display = 'block'
        input.focus()
      } else {
        input.style.display = 'none'
        vocabItems[i].selectedMeaning = sel.value
      }
    })

    input.addEventListener('blur', async () => {
      const val = input.value.trim()
      if (!val) return
      vocabItems[i].selectedMeaning = val
      await saveVocabMeaning(token.text, val)
      const opt = document.createElement('option')
      opt.value = val; opt.textContent = val; opt.selected = true
      sel.insertBefore(opt, sel.lastElementChild)
      input.style.display = 'none'
    })

    row.querySelector('.btn-dict').addEventListener('click', () => {
      currentDictVocabInfo = { token, sentId: sent.id, idx: i, vocabItems }
      openDictPopup(token.text, dictStatus, dictMatch?.entry_id || null)
    })

    content.appendChild(row)
    vocabItems.push({
      token,
      selectedMeaning,
      dictEntryId: existing?.dictionary_entry_id || dictMatch?.entry_id || null,
      existingId: existing?.id || null
    })
  })

  const saveBtn = document.createElement('button')
  saveBtn.className = 'btn-publish'
  saveBtn.style.marginTop = '16px'
  saveBtn.textContent = '語彙を保存'
  saveBtn.addEventListener('click', async () => {
    const session = await db.auth.getSession()
    const userId = session.data.session.user.id

    await db.from('lesson_sentence_vocab').delete().eq('sentence_id', sent.id)

    const insertData = vocabItems.map((v, i) => ({
      sentence_id: sent.id,
      lesson_id: lessonId,
      spanish: v.token.text,
      type: v.token.type,
      selected_meaning: v.selectedMeaning,
      dictionary_entry_id: v.dictEntryId || null,
      sort_order: i,
      user_id: userId
    }))

    if (insertData.length > 0) {
      await db.from('lesson_sentence_vocab').insert(insertData)
      for (const v of vocabItems) {
        if (v.selectedMeaning) await saveVocabMeaning(v.token.text, v.selectedMeaning)
      }
    }

    closePopup('popup-vocab-overlay')
    renderSentencePreview(sent, vocabItems)
  })
  content.appendChild(saveBtn)
}

function renderSentencePreview(sent, vocabItems) {
  const previewEl = document.getElementById(`preview-${sent.id}`)
  const bubble = document.getElementById(`bubble-${sent.id}`)
  if (!previewEl) return

  previewEl.innerHTML = ''
  const raw = sent.spanish_raw || ''
  const tokens = parseTokens(raw)
  const vocabMap = {}
  vocabItems.forEach(v => { if (v.selectedMeaning) vocabMap[v.token.text] = v.selectedMeaning })

  let activeSpan = null

  function appendToken(token, parent) {
    const span = document.createElement('span')
    span.className = `preview-token ${token.type}`
    span.textContent = token.text

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
    if (i > 0) previewEl.appendChild(document.createTextNode(' '))
    appendToken(token, previewEl)
  })

  previewEl.addEventListener('click', () => {
    if (activeSpan) activeSpan.classList.remove('active')
    activeSpan = null
    bubble.style.display = 'none'
  })
}

// ===== 辞書ポップアップ =====
async function openDictPopup(spanish, status, entryId) {
  document.getElementById('popup-dict-title').textContent = spanish
  const content = document.getElementById('popup-dict-content')
  content.innerHTML = '<div style="color:var(--muted);padding:12px">読み込み中...</div>'
  openPopup('popup-dict-overlay')

  if (status === 'registered' && entryId) {
    const { data: entry } = await db.from('dictionary_entries')
      .select('*, formats(name), parts_of_speech(name)').eq('id', entryId).single()
    content.innerHTML = entry ? `
      <div style="padding:12px 0">
        <div style="font-size:1.1rem;margin-bottom:4px">${entry.spanish}</div>
        <div style="font-size:0.85rem;color:var(--muted);margin-bottom:12px">${entry.japanese}</div>
        ${entry.example ? `<div style="font-size:0.85rem">${entry.example}</div>` : ''}
      </div>
      <button class="btn-new-dict" onclick="window.open('../../dictionary/new/word.html?id=${entry.id}','_blank')">辞書で編集する</button>
    ` : '<div style="padding:12px;color:var(--muted)">詳細を取得できませんでした</div>'
  } else {
    content.innerHTML = `
      <div class="dict-search-wrap">
        <input type="text" id="dict-search-input" placeholder="原形や日本語で検索" value="${spanish}" />
        <button class="btn-save-item" id="dict-search-btn">検索</button>
      </div>
      <div id="dict-search-results"></div>
      <button class="btn-new-dict" id="dict-new-btn">辞書に新規登録する</button>
    `
    document.getElementById('dict-search-btn').addEventListener('click', async () => {
      const q = document.getElementById('dict-search-input').value.trim()
      if (!q) return
      const { data } = await db.from('dictionary_entries')
        .select('*, formats(name)').or(`spanish.ilike.%${q}%,japanese.ilike.%${q}%`).limit(10)
      renderDictResults(data || [])
    })
    document.getElementById('dict-new-btn').addEventListener('click', () => {
      window.open(`../../dictionary/new/word.html?spanish=${encodeURIComponent(spanish)}`, '_blank')
    })
    const { data } = await db.from('dictionary_entries')
      .select('*, formats(name)').or(`spanish.ilike.%${spanish}%,japanese.ilike.%${spanish}%`).limit(10)
    renderDictResults(data || [])
  }
}

function renderDictResults(results) {
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
      <button class="btn-link-dict" data-id="${r.id}">紐付ける</button>
    </div>
  `).join('')
  container.querySelectorAll('.btn-link-dict').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentDictVocabInfo) {
        currentDictVocabInfo.vocabItems[currentDictVocabInfo.idx].dictEntryId = btn.dataset.id
      }
      closePopup('popup-dict-overlay')
    })
  })
}

// ===== トークン解析 =====
function parseTokens(raw) {
  const tokens = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === '[') {
      const end = findClosing(raw, i, '[', ']')
      const inner = raw.slice(i + 1, end)
      tokens.push({ type: 'phrase', text: stripSymbols(inner), children: parseInnerTokens(inner) })
      i = end + 1
    } else if (raw[i] === '(') {
      const end = findClosing(raw, i, '(', ')')
      const inner = raw.slice(i + 1, end)
      tokens.push({ type: 'expression', text: stripSymbols(inner) })
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
      tokens.push({ type: 'expression', text: stripSymbols(raw.slice(i + 1, end)) })
      i = end + 1
    } else if (raw[i] === ' ') { i++ }
    else {
      let j = i
      while (j < raw.length && !' ()'.includes(raw[j])) j++
      const text = raw.slice(i, j)
      if (text) tokens.push({ type: 'word', text })
      i = j
    }
  }
  return tokens
}

function flattenTokens(tokens, parentText) {
  const result = []
  tokens.forEach(t => {
    result.push({ ...t, parentText: parentText || null })
    if (t.children) result.push(...flattenTokens(t.children, t.text))
  })
  return result
}

function findClosing(str, start, open, close) {
  let depth = 0
  for (let i = start; i < str.length; i++) {
    if (str[i] === open) depth++
    if (str[i] === close) { depth--; if (depth === 0) return i }
  }
  return str.length - 1
}

function buildLookupMap(data) {
  const map = {}
  data.forEach(l => {
    const n = normalizeSpanish(l.form)
    if (!map[n]) map[n] = []
    map[n].push(l)
  })
  return map
}

function checkDictMatch(spanish, lookupMap) {
  const n = normalizeSpanish(spanish)
  if (lookupMap[n]) return lookupMap[n][0]
  const wa = removeArticle(n)
  if (wa !== n && lookupMap[wa]) return lookupMap[wa][0]
  return null
}

function normalizeSpanish(text) {
  return text.toLowerCase().replace(/[¿?¡!.,;:]/g, '').trim()
}

function removeArticle(text) {
  return text.replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, '').trim()
}

async function saveVocabMeaning(spanish, meaning) {
  const session = await db.auth.getSession()
  const userId = session.data.session.user.id
  const { data: existing } = await db.from('vocab_meanings').select('*').eq('spanish', spanish).maybeSingle()
  if (existing) {
    const newMeanings = [...new Set([...existing.meanings, meaning])]
    await db.from('vocab_meanings').update({ meanings: newMeanings }).eq('id', existing.id)
  } else {
    await db.from('vocab_meanings').insert({ spanish, meanings: [meaning], user_id: userId })
  }
}

// ===== Step 3 =====
function syncStep3() {
  const s1Title = document.getElementById('s1-title').value
  if (s1Title) document.getElementById('s3-title').value = s1Title

  if (audioBlocks.length > 0) {
    document.getElementById('s3-overall-start').value = audioBlocks[0].start_sec || 0
    const last = audioBlocks[audioBlocks.length - 1]
    if (last.end_sec) document.getElementById('s3-overall-end').value = last.end_sec
  }
}

async function loadStep3() {
  const { data } = await db.from('lessons').select('*').eq('id', lessonId).single()
  if (!data) return
  document.getElementById('s3-title').value = data.title || ''
  document.getElementById('s3-description').value = data.description || ''
  document.getElementById('s3-overall-start').value = data.overall_start || 0
  if (data.overall_end) document.getElementById('s3-overall-end').value = data.overall_end
  document.getElementById('s3-scope').value = data.scope || 'plus'
  document.getElementById('s3-tags').value = (data.tags || []).join(' ')
  if (data.category_id) document.getElementById('s3-category').value = data.category_id
  if (data.publish_start) document.getElementById('s3-publish-start').value = toLocalInput(data.publish_start)
  if (data.publish_end) document.getElementById('s3-publish-end').value = toLocalInput(data.publish_end)
}

function toLocalInput(isoStr) {
  const d = new Date(isoStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function loadCategories() {
  const { data } = await db.from('lesson_categories').select('*').order('name')
  if (!data) return
  allCategories = data
  const sel = document.getElementById('s3-category')
  sel.innerHTML = '<option value="">選択してください</option>'
  data.forEach(c => { sel.innerHTML += `<option value="${c.id}">${c.name}</option>` })
}

document.getElementById('btn-add-cat').addEventListener('click', () => {
  const wrap = document.getElementById('new-cat-wrap')
  wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none'
})

document.getElementById('btn-save-cat').addEventListener('click', async () => {
  const name = document.getElementById('new-cat-input').value.trim()
  if (!name) return
  const session = await db.auth.getSession()
  const { data, error } = await db.from('lesson_categories').insert({
    name, user_id: session.data.session.user.id
  }).select().single()
  if (!error) {
    allCategories.push(data)
    const sel = document.getElementById('s3-category')
    sel.innerHTML += `<option value="${data.id}" selected>${data.name}</option>`
    sel.value = data.id
    document.getElementById('new-cat-wrap').style.display = 'none'
    document.getElementById('new-cat-input').value = ''
  }
})

// ===== ナビゲーション =====
document.getElementById('btn-next-step').addEventListener('click', async () => {
  if (currentStep === 1) {
    const title = document.getElementById('s1-title').value.trim()
    if (!title) {
      document.getElementById('s1-error').textContent = 'タイトルを入力してください'
      return
    }
    await saveStep1()
    showStep(2)
  } else if (currentStep === 2) {
    if (audioBlocks.length === 0) {
      document.getElementById('s2-error').textContent = 'Audioを1つ以上追加してください'
      return
    }
    await loadCategories()
    await loadStep3()
    showStep(3)
  }
})

document.getElementById('btn-back-step').addEventListener('click', () => {
  if (currentStep === 2) showStep(1)
  else if (currentStep === 3) showStep(2)
})

// ===== 公開（レッスン作成） =====
document.getElementById('btn-publish').addEventListener('click', async () => {
  const btn = document.getElementById('btn-publish')
  btn.disabled = true
  btn.textContent = '作成中...'

  const title = document.getElementById('s3-title').value.trim()
  const publishStart = document.getElementById('s3-publish-start').value
  const publishEnd = document.getElementById('s3-publish-end').value
  const overallEnd = document.getElementById('s3-overall-end').value

  await db.from('lessons').update({
    title: title || document.getElementById('s1-title').value,
    description: document.getElementById('s3-description').value,
    category_id: document.getElementById('s3-category').value || null,
    tags: document.getElementById('s3-tags').value.split(/\s+/).filter(t => t),
    scope: document.getElementById('s3-scope').value,
    overall_start: parseFloat(document.getElementById('s3-overall-start').value) || 0,
    overall_end: overallEnd ? parseFloat(overallEnd) : null,
    publish_start: publishStart ? new Date(publishStart).toISOString() : null,
    publish_end: publishEnd ? (() => { const d = new Date(publishEnd); d.setSeconds(59); return d.toISOString() })() : null,
    status: 'published',
    updated_at: new Date().toISOString()
  }).eq('id', lessonId)

  window.location.href = '../lesson.html'
})

function openPopup(id) { document.getElementById(id).classList.add('open') }
function closePopup(id) { document.getElementById(id).classList.remove('open') }

document.getElementById('popup-vocab-close').addEventListener('click', () => closePopup('popup-vocab-overlay'))
document.getElementById('popup-dict-close').addEventListener('click', () => closePopup('popup-dict-overlay'))

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

// ===== 起動 =====
;(async () => {
  await checkAuth()
  await initStep1()
  if (currentStep === 2) {
    showStep(2)
    await loadAudioBlocks()
    const { data: lesson } = await db.from('lessons').select('youtube_id').eq('id', lessonId).single()
    if (lesson?.youtube_id) document.getElementById('yt-id-input').value = lesson.youtube_id
  } else {
    showStep(currentStep)
  }
})()

// ===== 動画折りたたみ =====
document.getElementById('btn-toggle-player').addEventListener('click', () => {
  const playerWrap = document.querySelector('.youtube-player-wrap')
  const icon = document.getElementById('toggle-player-icon')
  const isCollapsed = playerWrap.classList.toggle('collapsed')
  icon.textContent = isCollapsed ? '▼' : '▲'
})

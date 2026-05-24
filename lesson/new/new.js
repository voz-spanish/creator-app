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
let materialId = params.get('id')       // audio_materials.id
let currentStep = 1
let ytPlayer = null
let ytReady = false
let audioItems = []                     // audio_material_items の配列
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
  ;[1, 2, 3, 4].forEach(s => {
    document.getElementById(`step-${s}`).style.display = s === step ? 'block' : 'none'
    const ind = document.getElementById(`step-${s}-indicator`)
    ind.classList.toggle('active', s === step)
    ind.classList.toggle('done', s < step)
  })
  document.getElementById('btn-back-step').style.display = step > 1 ? 'block' : 'none'
  document.getElementById('btn-next-step').style.display = step < 4 ? 'block' : 'none'
  document.getElementById('btn-publish').style.display = step === 4 ? 'block' : 'none'

  // Step1のボタンラベルを変える
  const nextBtn = document.getElementById('btn-next-step')
  if (step === 1) nextBtn.textContent = '作成をはじめる →'
  else if (step === 2) nextBtn.textContent = '音声紐付けへ →'
  else if (step === 3) nextBtn.textContent = 'プレビューへ →'

  if (step === 3) loadYouTubeAPI()
  if (step === 4) renderPreview()

  const toggleBtn = document.getElementById('btn-toggle-player')
  if (toggleBtn) toggleBtn.style.display = step === 3 ? 'flex' : 'none'
}

// ===== Step 1 =====
async function initStep1() {
  if (materialId) {
    const { data } = await db.from('audio_materials').select('*').eq('id', materialId).single()
    if (data) {
      document.getElementById('s1-title').value = data.title || ''
      const radios = document.querySelectorAll('input[name="lesson-type"]')
      radios.forEach(r => { if (r.value === data.type) r.checked = true })
    }
  }
}

// Step1「作成をはじめる」でDB登録
async function createMaterial() {
  const title = document.getElementById('s1-title').value.trim()
  const type = document.querySelector('input[name="lesson-type"]:checked')?.value || 'youtube'
  if (!title) {
    document.getElementById('s1-error').textContent = 'タイトルを入力してください'
    return false
  }
  document.getElementById('s1-error').textContent = ''

  if (!materialId) {
    const session = await db.auth.getSession()
    const userId = session.data.session.user.id
    const { data, error } = await db.from('audio_materials').insert({
      title, type, status: 'draft', user_id: userId
    }).select().single()
    if (error || !data) {
      document.getElementById('s1-error').textContent = '作成に失敗しました'
      return false
    }
    materialId = data.id
  } else {
    await db.from('audio_materials').update({
      title, type, updated_at: new Date().toISOString()
    }).eq('id', materialId)
  }
  return true
}

// ===== Step 2: テキスト登録 =====
async function initStep2() {
  const container = document.getElementById('text-audio-blocks')
  container.innerHTML = ''
  audioItems = []

  // 既存データ読み込み
  const { data: items } = await db.from('audio_material_items')
    .select('*').eq('material_id', materialId).order('sort_order')

  if (items && items.length > 0) {
    for (const item of items) {
      const { data: sentences } = await db.from('audio_sentences')
        .select('*').eq('item_id', item.id).order('sort_order')
      audioItems.push({ ...item, sentences: sentences || [] })
      renderTextAudioBlock(audioItems.length - 1)
    }
  } else {
    // 初回は1つ自動追加
    await addTextAudioBlock()
  }
}

async function addTextAudioBlock() {
  const audioNum = audioItems.length + 1
  const { data, error } = await db.from('audio_material_items').insert({
    material_id: materialId,
    audio_number: audioNum,
    sort_order: audioItems.length
  }).select().single()
  if (!error) {
    audioItems.push({ ...data, sentences: [] })
    renderTextAudioBlock(audioItems.length - 1)
  }
}

document.getElementById('btn-add-text-audio').addEventListener('click', addTextAudioBlock)

function renderTextAudioBlock(idx) {
  const item = audioItems[idx]
  const container = document.getElementById('text-audio-blocks')

  const block = document.createElement('div')
  block.className = 'audio-block'
  block.id = `text-audio-block-${idx}`

  block.innerHTML = `
    <div class="audio-block-header">
      <span class="audio-block-title">Audio ${item.audio_number}</span>
    </div>
    <div class="audio-block-body">
      <div class="section-card-title" style="font-size:0.68rem;letter-spacing:0.2em;color:var(--muted)">
        センテンス入力（/ で区切ると複数に分割）
      </div>
      <div class="input-hint-text">
        単語: そのまま　( ) : 表現（細分化なし）　[ ] : フレーズ（細分化あり）　/ / : センテンス区切り
      </div>
      <textarea class="audio-text-input" placeholder="例: /¿Qué hiciste hoy?/ /¿Qué comiste?/" rows="3"></textarea>
      <button class="btn-auto btn-parse-sentences">✨ センテンスを解析</button>
      <div class="sentences-wrap" id="text-sentences-${idx}"></div>
    </div>
  `

  // センテンス解析
  block.querySelector('.btn-parse-sentences').addEventListener('click', async () => {
    const raw = block.querySelector('.audio-text-input').value.trim()
    if (!raw) return
    const sentences = parseSentences(raw)
    const sentWrap = document.getElementById(`text-sentences-${idx}`)

    // ① DOM消去より前に日本語・秒数を回収
    const prevDataMap = {}
    if (audioItems[idx].sentences && audioItems[idx].sentences.length > 0) {
      audioItems[idx].sentences.forEach(s => {
        const domTextarea = document.querySelector(`#text-sentence-${s.id} .sent-japanese`)
        const japanese = domTextarea ? domTextarea.value : (s.japanese || '')
        prevDataMap[s.spanish_display] = {
          japanese,
          start_sec: s.start_sec ?? null,
          end_sec: s.end_sec ?? null
        }
      })
      // ② 回収完了後にDOMをクリア
      sentWrap.innerHTML = ''
      for (const s of audioItems[idx].sentences) {
        await db.from('audio_sentence_vocab').delete().eq('sentence_id', s.id)
        await db.from('audio_sentences').delete().eq('id', s.id)
      }
    } else {
      sentWrap.innerHTML = ''
    }
    audioItems[idx].sentences = []

    for (let si = 0; si < sentences.length; si++) {
      const raw_sent = sentences[si]
      const display = stripSymbols(raw_sent)
      // 同じdisplayの既存データがあれば引き継ぐ
      const prev = prevDataMap[display] || {}
      const { data, error } = await db.from('audio_sentences').insert({
        item_id: item.id,
        material_id: materialId,
        sentence_number: si + 1,
        spanish_raw: raw_sent,
        spanish_display: display,
        japanese: prev.japanese || null,
        start_sec: prev.start_sec ?? null,
        end_sec: prev.end_sec ?? null,
        sort_order: si
      }).select().single()
      if (!error) {
        audioItems[idx].sentences.push(data)
        renderTextSentenceBlock(idx, si, data)
      }
    }
  })

  container.appendChild(block)

  // 既存センテンス描画（appendChildの後）
  if (item.sentences && item.sentences.length > 0) {
    // textareaにsentences_rawを / 区切りで復元
    const restoredText = item.sentences
      .map(s => s.spanish_raw || s.spanish_display || '')
      .filter(s => s)
      .map(s => `/${s}/`)
      .join(' ')
    block.querySelector('.audio-text-input').value = restoredText

    item.sentences.forEach((sent, si) => renderTextSentenceBlock(idx, si, sent))
  }
}

function renderTextSentenceBlock(audioIdx, sentIdx, sent) {
  const wrap = document.getElementById(`text-sentences-${audioIdx}`)
  const block = document.createElement('div')
  block.className = 'sentence-block'
  block.id = `text-sentence-${sent.id}`

  block.innerHTML = `
    <div class="sentence-label">センテンス ${sentIdx + 1}</div>
    <button class="btn-sentence-delete">✕</button>
    <div class="field">
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

  block.querySelector('.btn-sentence-delete').addEventListener('click', async () => {
    if (!confirm('このセンテンスを削除しますか？')) return
    await db.from('audio_sentence_vocab').delete().eq('sentence_id', sent.id)
    await db.from('audio_sentences').delete().eq('id', sent.id)
    audioItems[audioIdx].sentences = audioItems[audioIdx].sentences.filter(s => s.id !== sent.id)
    block.remove()
  })

  block.querySelector('.sent-japanese').addEventListener('blur', async (e) => {
    await db.from('audio_sentences').update({ japanese: e.target.value }).eq('id', sent.id)
  })

  block.querySelector('.btn-vocab').addEventListener('click', () => openVocabPopup(sent, audioIdx))

  wrap.appendChild(block)
}

// ===== Step 3: 音声紐付け =====
async function initStep3() {
  const container = document.getElementById('timing-audio-blocks')
  container.innerHTML = ''

  // YouTube ID 読み込み
  const { data: material } = await db.from('audio_materials').select('youtube_id').eq('id', materialId).single()
  if (material?.youtube_id) document.getElementById('yt-id-input').value = material.youtube_id

  // 各Audioブロック描画
  audioItems.forEach((item, idx) => renderTimingAudioBlock(idx))
  updateAudioCurrentLabel()
}

document.getElementById('btn-load-yt').addEventListener('click', async () => {
  const id = document.getElementById('yt-id-input').value.trim()
  if (!id || !ytPlayer) return
  ytPlayer.loadVideoById(id)
  await db.from('audio_materials').update({
    youtube_id: id, updated_at: new Date().toISOString()
  }).eq('id', materialId)
})

function renderTimingAudioBlock(idx) {
  const item = audioItems[idx]
  const container = document.getElementById('timing-audio-blocks')

  const block = document.createElement('div')
  block.className = 'audio-block'
  block.id = `timing-audio-block-${idx}`

  const hasSentences = item.sentences && item.sentences.length > 0
  const startStr = formatSec(item.start_sec || 0)
  const endStr = item.end_sec != null ? formatSec(item.end_sec) : '未設定'

  // センテンスがある場合はセンテンス単位、ない場合はAudio全体で秒数設定
  let sentencesHTML = ''
  if (hasSentences) {
    sentencesHTML = item.sentences.map((sent, si) => `
      <div class="sentence-block" id="timing-sentence-${sent.id}">
        <div class="sentence-label">センテンス ${si + 1}</div>
        <div class="display-preview" style="margin-bottom:8px">${sent.spanish_display || ''}</div>
        <div class="sentence-sec-row">
          <div class="sec-input-wrap">
            <label>開始秒</label>
            <input type="number" class="sent-start" min="0" step="0.01"
              value="${sent.start_sec ?? ''}" placeholder="未設定" style="width:88px" />
          </div>
          <button class="btn-mark btn-mark-start sent-mark-start" style="font-size:0.7rem;padding:6px 8px">▶ ここから</button>
          <div class="sec-input-wrap">
            <label>終了秒</label>
            <input type="number" class="sent-end" min="0" step="0.01"
              value="${sent.end_sec ?? ''}" placeholder="未設定" style="width:88px" />
          </div>
          <button class="btn-mark btn-mark-end sent-mark-end" style="font-size:0.7rem;padding:6px 8px">■ ここまで</button>
          <button class="btn-play-range sent-play" style="font-size:0.7rem;padding:5px 10px">▶</button>
        </div>
      </div>
    `).join('')
  }

  block.innerHTML = `
    <div class="audio-block-header">
      <span class="audio-block-title">Audio ${item.audio_number}</span>
      <span class="audio-block-range">${startStr} — ${endStr}</span>
    </div>
    <div class="audio-block-body">
      <div class="sec-input-row">
        <div class="sec-input-wrap">
          <label>開始秒（Audio全体）</label>
          <input type="number" class="audio-start" min="0" step="0.01" value="${item.start_sec || 0}" />
        </div>
        <button class="btn-mark btn-mark-start">▶ ここから</button>
        <div class="sec-input-wrap">
          <label>終了秒（Audio全体）</label>
          <input type="number" class="audio-end" min="0" step="0.01" value="${item.end_sec ?? ''}" placeholder="未設定" />
        </div>
        <button class="btn-mark btn-mark-end">■ ここまで</button>
        <button class="btn-play-range">▶ 再生</button>
      </div>
      ${hasSentences ? `
        <div class="section-card-title" style="font-size:0.68rem;letter-spacing:0.2em;color:var(--muted);margin-top:8px">
          センテンスごとの秒数
        </div>
        <div class="sentences-wrap" id="timing-sentences-${idx}">${sentencesHTML}</div>
      ` : ''}
    </div>
  `

  // Audio全体 ▶ ここから
  block.querySelector('.btn-mark-start').addEventListener('click', async () => {
    if (!ytPlayer) return
    const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(2))
    block.querySelector('.audio-start').value = sec
    audioItems[idx].start_sec = sec
    await saveItemRange(idx)
    updateTimingBlockHeader(idx)
    updateAudioCurrentLabel()
  })

  // Audio全体 ■ ここまで
  block.querySelector('.btn-mark-end').addEventListener('click', async () => {
    if (!ytPlayer) return
    const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(2))
    block.querySelector('.audio-end').value = sec
    audioItems[idx].end_sec = sec
    await saveItemRange(idx)
    updateTimingBlockHeader(idx)
    updateAudioCurrentLabel()
  })

  // Audio全体 再生
  block.querySelector('.btn-play-range').addEventListener('click', () => {
    if (!ytPlayer) return
    const start = audioItems[idx].start_sec || 0
    const end = audioItems[idx].end_sec
    ytPlayer.seekTo(start, true)
    ytPlayer.playVideo()
    if (end) setTimeout(() => ytPlayer.pauseVideo(), (end - start) * 1000)
  })

  // Audio全体 手動入力
  block.querySelector('.audio-start').addEventListener('change', async (e) => {
    audioItems[idx].start_sec = parseFloat(e.target.value) || 0
    await saveItemRange(idx)
    updateTimingBlockHeader(idx)
  })
  block.querySelector('.audio-end').addEventListener('change', async (e) => {
    audioItems[idx].end_sec = e.target.value ? parseFloat(e.target.value) : null
    await saveItemRange(idx)
    updateTimingBlockHeader(idx)
  })

  // センテンスごとのイベント
  if (hasSentences) {
    item.sentences.forEach((sent, si) => {
      const sentBlock = block.querySelector(`#timing-sentence-${sent.id}`)
      if (!sentBlock) return

      sentBlock.querySelector('.sent-mark-start').addEventListener('click', async () => {
        if (!ytPlayer) return
        const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(2))
        sentBlock.querySelector('.sent-start').value = sec
        audioItems[idx].sentences[si].start_sec = sec
        await db.from('audio_sentences').update({ start_sec: sec }).eq('id', sent.id)
      })

      sentBlock.querySelector('.sent-mark-end').addEventListener('click', async () => {
        if (!ytPlayer) return
        const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(2))
        sentBlock.querySelector('.sent-end').value = sec
        audioItems[idx].sentences[si].end_sec = sec
        await db.from('audio_sentences').update({ end_sec: sec }).eq('id', sent.id)
      })

      sentBlock.querySelector('.sent-play').addEventListener('click', () => {
        if (!ytPlayer) return
        const start = parseFloat(sentBlock.querySelector('.sent-start').value)
          || audioItems[idx].start_sec || 0
        const end = parseFloat(sentBlock.querySelector('.sent-end').value)
          || audioItems[idx].end_sec
        ytPlayer.seekTo(start, true)
        ytPlayer.playVideo()
        if (end) setTimeout(() => ytPlayer.pauseVideo(), (end - start) * 1000)
      })

      sentBlock.querySelector('.sent-start').addEventListener('change', async (e) => {
        const sec = parseFloat(e.target.value) || 0
        audioItems[idx].sentences[si].start_sec = sec
        await db.from('audio_sentences').update({ start_sec: sec }).eq('id', sent.id)
      })

      sentBlock.querySelector('.sent-end').addEventListener('change', async (e) => {
        const sec = e.target.value ? parseFloat(e.target.value) : null
        audioItems[idx].sentences[si].end_sec = sec
        await db.from('audio_sentences').update({ end_sec: sec }).eq('id', sent.id)
      })
    })
  }

  container.appendChild(block)
}

async function saveItemRange(idx) {
  const item = audioItems[idx]
  await db.from('audio_material_items').update({
    start_sec: item.start_sec,
    end_sec: item.end_sec
  }).eq('id', item.id)
}

function updateTimingBlockHeader(idx) {
  const item = audioItems[idx]
  const block = document.getElementById(`timing-audio-block-${idx}`)
  if (!block) return
  const rangeEl = block.querySelector('.audio-block-range')
  rangeEl.textContent = `${formatSec(item.start_sec || 0)} — ${item.end_sec != null ? formatSec(item.end_sec) : '未設定'}`
}

function updateAudioCurrentLabel() {
  const label = document.getElementById('audio-current-label')
  if (audioItems.length === 0) { label.textContent = ''; return }
  const last = audioItems[audioItems.length - 1]
  label.textContent = `▶ Audio ${last.audio_number}  ${formatSec(last.start_sec || 0)} — ${last.end_sec != null ? formatSec(last.end_sec) : '未設定'}`
}

// ===== Step 4: プレビュー =====
function renderPreview() {
  const container = document.getElementById('preview-blocks')
  container.innerHTML = ''

  audioItems.forEach((item, idx) => {
    const block = document.createElement('div')
    block.className = 'audio-block'
    block.style.marginBottom = '16px'

    const hasSentences = item.sentences && item.sentences.length > 0
    const startStr = formatSec(item.start_sec || 0)
    const endStr = item.end_sec != null ? formatSec(item.end_sec) : '未設定'

    // センテンスがない（Audio全体で1まとまり）
    if (!hasSentences) {
      block.innerHTML = `
        <div class="audio-block-header">
          <span class="audio-block-title">Audio ${item.audio_number}</span>
          <span class="audio-block-range">${startStr} — ${endStr}</span>
        </div>
        <div class="audio-block-body">
          <div style="color:var(--muted);font-size:0.82rem">センテンス未登録</div>
        </div>
      `
    } else {
      const sentHTML = item.sentences.map((sent, si) => {
        const sStart = sent.start_sec != null ? formatSec(sent.start_sec) : startStr
        const sEnd = sent.end_sec != null ? formatSec(sent.end_sec) : endStr
        return `
          <div class="sentence-block" id="preview-sent-block-${sent.id}" style="gap:8px">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <button class="btn-play-range preview-play"
                data-start="${sent.start_sec ?? item.start_sec ?? 0}"
                data-end="${sent.end_sec ?? item.end_sec ?? ''}"
                style="font-size:0.7rem;padding:5px 10px;flex-shrink:0">
                ▶ ${sStart}–${sEnd}
              </button>
              <div class="preview-wrap" id="preview-${sent.id}"
                style="flex:1;min-width:0;padding:8px 12px;cursor:pointer">
                ${sent.spanish_display || ''}
              </div>
            </div>
            <div class="preview-meaning-bubble" id="bubble-${sent.id}" style="display:none"></div>
          </div>
        `
      }).join('')

      block.innerHTML = `
        <div class="audio-block-header">
          <span class="audio-block-title">Audio ${item.audio_number}</span>
          <span class="audio-block-range">${startStr} — ${endStr}</span>
        </div>
        <div class="audio-block-body">
          <div class="sentences-wrap">${sentHTML}</div>
        </div>
      `
    }

    // 再生ボタンイベント
    block.querySelectorAll('.preview-play').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!ytPlayer) return
        const start = parseFloat(btn.dataset.start) || 0
        const end = parseFloat(btn.dataset.end) || null
        ytPlayer.seekTo(start, true)
        ytPlayer.playVideo()
        if (end) setTimeout(() => ytPlayer.pauseVideo(), (end - start) * 1000)
      })
    })

    // テキストクリックで日本語表示
    item.sentences && item.sentences.forEach(sent => {
      const previewEl = block.querySelector(`#preview-${sent.id}`)
      const bubble = block.querySelector(`#bubble-${sent.id}`)
      if (!previewEl || !bubble) return
      previewEl.addEventListener('click', (e) => {
        e.stopPropagation()
        if (bubble.style.display === 'none') {
          bubble.textContent = sent.japanese || '（意味未登録）'
          bubble.style.display = 'inline-block'
        } else {
          bubble.style.display = 'none'
        }
      })
    })

    container.appendChild(block)
  })
}

// ===== 秒数フォーマット =====
function formatSec(sec) {
  const totalSec = parseFloat(sec) || 0
  const m = Math.floor(totalSec / 60)
  const s = (totalSec % 60).toFixed(2)
  return `${m}:${String(s).padStart(5, '0')}`
}

// ===== 語彙ポップアップ =====
async function openVocabPopup(sent, audioIdx) {
  document.getElementById('popup-vocab-title').textContent = sent.spanish_display || sent.spanish_raw
  const content = document.getElementById('popup-vocab-content')
  content.innerHTML = '<div style="color:var(--muted);padding:12px">読み込み中...</div>'
  openPopup('popup-vocab-overlay')

  const { data: existingVocab } = await db.from('audio_sentence_vocab')
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
    // 重複除去済みの意味リスト
    const rawMs = meaningsMap[token.text] || []
    const ms = [...new Set(rawMs)]
    const selectedMeaning = existing?.selected_meaning || ms[0] || ''
    const dictMatch = checkDictMatch(token.text, lookupMap)
    const dictStatus = dictMatch ? 'registered' : 'unregistered'

    const row = document.createElement('div')
    row.className = 'vocab-row'
    row.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:12px 0;border-bottom:1px solid color-mix(in srgb,var(--earth) 12%,transparent)'
    const typeLabel = token.type === 'phrase' ? 'フレーズ' : token.type === 'expression' ? '表現' : '単語'
    const typeClass = `vocab-type-${token.type}`

    // ヘッダー行
    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px'
    header.innerHTML = `
      <div class="vocab-spanish-label" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span class="vocab-type-badge ${typeClass}">${typeLabel}</span>
        <span style="font-size:0.88rem">${token.text}</span>
        ${token.parentText ? `<span style="font-size:0.65rem;color:var(--muted)">（${token.parentText}内）</span>` : ''}
      </div>
      <button class="btn-dict ${dictStatus}" style="flex-shrink:0">${dictStatus === 'registered' ? '確認・編集' : '新規登録'}</button>
    `
    header.querySelector('.btn-dict').addEventListener('click', () => {
      currentDictVocabInfo = { token, sentId: sent.id, idx: i, vocabItems }
      openDictPopup(token.text, dictStatus, dictMatch?.entry_id || null)
    })
    row.appendChild(header)

    // 意味リスト
    const meaningList = document.createElement('div')
    meaningList.style.cssText = 'display:flex;flex-direction:column;gap:4px'

    const currentMeanings = [...ms] // ローカルで管理

    function renderMeaningList() {
      meaningList.innerHTML = ''
      currentMeanings.forEach((m, mi) => {
        const mRow = document.createElement('div')
        mRow.style.cssText = 'display:flex;align-items:center;gap:6px'
        const isSelected = m === vocabItems[i]?.selectedMeaning

        mRow.innerHTML = `
          <div style="flex:1;display:flex;align-items:center;gap:6px;padding:6px 10px;
            background:${isSelected ? 'color-mix(in srgb,var(--accent) 8%,var(--surface))' : 'var(--bg)'};
            border:1px solid ${isSelected ? 'var(--accent)' : 'color-mix(in srgb,var(--earth) 20%,transparent)'};
            cursor:pointer;font-size:0.85rem">
            <span style="flex:1" class="meaning-text">${m}</span>
            ${isSelected ? '<span style="font-size:0.65rem;color:var(--accent)">✓ 選択中</span>' : ''}
          </div>
          <button class="btn-edit-meaning" style="background:none;border:1px solid var(--earth);color:var(--earth);
            font-size:0.65rem;padding:4px 7px;cursor:pointer;font-family:'Noto Serif JP',serif">編集</button>
          <button class="btn-delete-meaning" style="background:none;border:1px solid var(--muted);color:var(--muted);
            font-size:0.65rem;padding:4px 7px;cursor:pointer;font-family:'Noto Serif JP',serif">削除</button>
        `

        // 選択
        mRow.querySelector('.meaning-text').addEventListener('click', () => {
          vocabItems[i].selectedMeaning = m
          renderMeaningList()
        })
        mRow.querySelector('div').addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') return
          vocabItems[i].selectedMeaning = m
          renderMeaningList()
        })

        // 編集
        mRow.querySelector('.btn-edit-meaning').addEventListener('click', async () => {
          const newVal = prompt('意味を編集してください', m)
          if (!newVal || newVal.trim() === m) return
          const trimmed = newVal.trim()
          // vocab_meaningsを更新
          const { data: vm } = await db.from('vocab_meanings').select('*').eq('spanish', token.text).maybeSingle()
          if (vm) {
            const updated = vm.meanings.map(x => x === m ? trimmed : x)
            const deduped = [...new Set(updated)]
            await db.from('vocab_meanings').update({ meanings: deduped }).eq('id', vm.id)
            currentMeanings[mi] = trimmed
            if (vocabItems[i].selectedMeaning === m) vocabItems[i].selectedMeaning = trimmed
            renderMeaningList()
          }
        })

        // 削除
        mRow.querySelector('.btn-delete-meaning').addEventListener('click', async () => {
          if (!confirm(`「${m}」を削除しますか？`)) return
          const { data: vm } = await db.from('vocab_meanings').select('*').eq('spanish', token.text).maybeSingle()
          if (vm) {
            const updated = vm.meanings.filter(x => x !== m)
            await db.from('vocab_meanings').update({ meanings: updated }).eq('id', vm.id)
            currentMeanings.splice(mi, 1)
            if (vocabItems[i].selectedMeaning === m) {
              vocabItems[i].selectedMeaning = currentMeanings[0] || ''
            }
            renderMeaningList()
          }
        })

        meaningList.appendChild(mRow)
      })

      // 新しい意味を追加
      const addRow = document.createElement('div')
      addRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:2px'
      addRow.innerHTML = `
        <input type="text" class="vocab-new-input" placeholder="新しい意味を追加"
          style="flex:1;font-size:0.82rem;padding:6px 10px">
        <button class="btn-add-meaning" style="background:var(--earth);color:var(--surface);border:none;
          padding:6px 12px;font-family:'Noto Serif JP',serif;font-size:0.75rem;cursor:pointer">追加</button>
      `
      const newInput = addRow.querySelector('.vocab-new-input')
      const addBtn = addRow.querySelector('.btn-add-meaning')

      async function addMeaning() {
        const val = newInput.value.trim()
        if (!val) return
        if (currentMeanings.includes(val)) {
          newInput.value = ''
          return
        }
        await saveVocabMeaning(token.text, val)
        currentMeanings.push(val)
        vocabItems[i].selectedMeaning = vocabItems[i].selectedMeaning || val
        newInput.value = ''
        renderMeaningList()
      }

      addBtn.addEventListener('click', addMeaning)
      newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMeaning() } })

      meaningList.appendChild(addRow)
    }

    row.appendChild(meaningList)
    content.appendChild(row)

    vocabItems.push({
      token,
      selectedMeaning,
      dictEntryId: existing?.dictionary_entry_id || dictMatch?.entry_id || null,
      existingId: existing?.id || null
    })

    renderMeaningList()
  })

  const saveBtn = document.createElement('button')
  saveBtn.className = 'btn-publish'
  saveBtn.style.marginTop = '16px'
  saveBtn.textContent = '語彙を保存'
  saveBtn.addEventListener('click', async () => {
    const session = await db.auth.getSession()
    const userId = session.data.session.user.id

    await db.from('audio_sentence_vocab').delete().eq('sentence_id', sent.id)

    const insertData = vocabItems.map((v, i) => ({
      sentence_id: sent.id,
      material_id: materialId,
      spanish: v.token.text,
      type: v.token.type,
      selected_meaning: v.selectedMeaning,
      dictionary_entry_id: v.dictEntryId || null,
      sort_order: i,
      user_id: userId
    }))

    if (insertData.length > 0) {
      await db.from('audio_sentence_vocab').insert(insertData)
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
      if (meaning && bubble) {
        bubble.textContent = `${token.text} — ${meaning}`
        bubble.style.display = 'inline-block'
      } else if (bubble) {
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
    if (bubble) bubble.style.display = 'none'
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

function parseSentences(raw) {
  const parts = raw.split('/').map(s => s.trim()).filter(s => s.length > 0)
  return parts.length > 0 ? parts : [raw]
}

function stripSymbols(str) {
  return str.replace(/[\[\]()\/]/g, '').replace(/\s+/g, ' ').trim()
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

// ===== ナビゲーション =====
document.getElementById('btn-next-step').addEventListener('click', async () => {
  if (currentStep === 1) {
    const ok = await createMaterial()
    if (!ok) return
    await initStep2()
    showStep(2)

  } else if (currentStep === 2) {
    if (audioItems.length === 0) {
      document.getElementById('s2-error').textContent = 'Audioを1つ以上追加してください'
      return
    }
    await initStep3()
    showStep(3)

  } else if (currentStep === 3) {
    showStep(4)
  }
})

document.getElementById('btn-back-step').addEventListener('click', () => {
  if (currentStep === 2) showStep(1)
  else if (currentStep === 3) showStep(2)
  else if (currentStep === 4) showStep(3)
})

// ===== 保存（素材として確定） =====
document.getElementById('btn-publish').addEventListener('click', async () => {
  const btn = document.getElementById('btn-publish')
  btn.disabled = true
  btn.textContent = '保存中...'

  await db.from('audio_materials').update({
    status: 'saved',
    updated_at: new Date().toISOString()
  }).eq('id', materialId)

  window.location.href = '../lesson.html'
})

// ===== 動画折りたたみ =====
document.getElementById('btn-toggle-player').addEventListener('click', () => {
  const playerWrap = document.getElementById('youtube-player-wrap')
  const icon = document.getElementById('toggle-player-icon')
  const isCollapsed = playerWrap.classList.toggle('collapsed')
  icon.textContent = isCollapsed ? '▼' : '▲'
})

// ===== ポップアップ =====
function openPopup(id) { document.getElementById(id).classList.add('open') }
function closePopup(id) { document.getElementById(id).classList.remove('open') }

document.getElementById('popup-vocab-close').addEventListener('click', () => closePopup('popup-vocab-overlay'))
document.getElementById('popup-dict-close').addEventListener('click', () => closePopup('popup-dict-overlay'))

// ===== ハンバーガー =====
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
  showStep(1)
})()

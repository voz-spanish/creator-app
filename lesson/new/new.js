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
let maxReachedStep = 1   // これまでに到達した最大ステップ番号

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
  if (step > maxReachedStep) maxReachedStep = step
  ;[1, 2, 3, 4].forEach(s => {
    document.getElementById(`step-${s}`).style.display = s === step ? 'block' : 'none'
    const ind = document.getElementById(`step-${s}-indicator`)
    ind.classList.toggle('active', s === step)
    ind.classList.toggle('done', s !== step && s <= maxReachedStep)
  })
  document.getElementById('btn-back-step').style.display = step > 1 ? 'block' : 'none'
  document.getElementById('btn-next-step').style.display = step < 4 ? 'block' : 'none'
  document.getElementById('btn-publish').style.display = step === 4 ? 'block' : 'none'

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
    <div class="audio-block-header audio-block-toggle" data-target="text-audio-body-${idx}" style="cursor:pointer">
      <span class="audio-block-title">Audio ${item.audio_number}</span>
      <span class="audio-toggle-icon" style="font-size:0.65rem;color:var(--muted)">▼</span>
    </div>
    <div class="audio-block-body" id="text-audio-body-${idx}">
      <div class="section-card-title" style="font-size:0.68rem;letter-spacing:0.2em;color:var(--muted)">
        センテンス入力
      </div>
      <div class="input-hint-text">
        | : センテンス区切り
      </div>
      <textarea class="audio-text-input" placeholder="例: ¿Qué hiciste hoy?|¿Qué comiste?" rows="3"></textarea>
      <button class="btn-auto btn-parse-sentences">✨ センテンスを解析</button>
      <div class="sentences-wrap" id="text-sentences-${idx}"></div>
    </div>
  `

  // Audioブロック 折りたたみ
  block.querySelector('.audio-block-toggle').addEventListener('click', (e) => {
    if (e.target.closest('button, textarea')) return
    toggleAudioBody(block, `text-audio-body-${idx}`)
  })

  // センテンス入力テキストをblur時に自動保存
  block.querySelector('.audio-text-input').addEventListener('blur', async (e) => {
    const val = e.target.value.trim()
    if (!val || !audioItems[idx]?.id) return
    await db.from('audio_material_items')
      .update({ raw_text: val, updated_at: new Date().toISOString() })
      .eq('id', audioItems[idx].id)
  })

  block.querySelector('.btn-parse-sentences').addEventListener('click', async () => {
    const raw = block.querySelector('.audio-text-input').value.trim()
    if (!raw) return
    const sentences = parseSentences(raw)
    const sentWrap = document.getElementById(`text-sentences-${idx}`)

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

  if (item.sentences && item.sentences.length > 0) {
    const restoredText = item.sentences
      .map(s => s.spanish_display || s.spanish_raw || '')
      .filter(s => s)
      .join('|')
    block.querySelector('.audio-text-input').value = restoredText

    item.sentences.forEach((sent, si) => renderTextSentenceBlock(idx, si, sent))
  } else if (item.raw_text) {
    // センテンス未解析でもraw_textがあれば入力欄を復元
    block.querySelector('.audio-text-input').value = item.raw_text
  }
}

function renderTextSentenceBlock(audioIdx, sentIdx, sent) {
  const wrap = document.getElementById(`text-sentences-${audioIdx}`)
  const block = document.createElement('div')
  block.className = 'sentence-block'
  block.id = `text-sentence-${sent.id}`

  block.innerHTML = `
    <div class="sent-block-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
        <div class="sentence-label" style="flex-shrink:0">センテンス ${sentIdx + 1}</div>
        <div class="sent-header-preview" style="font-size:0.8rem;color:var(--muted);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0">
          ${sent.spanish_display || ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span class="audio-toggle-icon" style="font-size:0.6rem;color:var(--muted)">▼</span>
        <button class="btn-sentence-delete">✕</button>
      </div>
    </div>

    <!-- 本体（折りたたみ対象） -->
    <div class="sent-block-body" id="sent-body-${sent.id}">

    <!-- スペイン語表示 -->
    <div class="display-preview" id="sent-display-${sent.id}">${sent.spanish_display || ''}</div>

    <!-- チャンク記法入力エリア -->
    <div class="chunk-input-section" id="chunk-input-section-${sent.id}">
      <div class="input-hint-text" style="margin-bottom:4px">
        単語: そのまま　{ } : 表現（記号含む）　[ ] : フレーズ（細分化あり）　" " : 語彙登録なし　/ : チャンク区切り
      </div>
      <div style="display:flex;gap:6px;align-items:flex-start">
        <textarea class="chunk-spanish-input" rows="2"
          placeholder="例: últimamente/[tratamos de] mezclar/(los jueves)/entre sus audios"
          style="flex:1"></textarea>
        <button class="btn-chunk-go btn-auto" style="align-self:flex-end;white-space:nowrap">解析</button>
      </div>
    </div>

    <!-- チャンクブロック一覧 -->
    <div id="chunk-blocks-${sent.id}" style="display:flex;flex-direction:column;gap:8px"></div>

    <!-- チャンク直訳プレビュー（全体） -->
    <div class="chunk-literal-preview" id="chunk-literal-${sent.id}" style="display:none"></div>

    <!-- 日本語意味（自然な翻訳） -->
    <div class="field">
      <button class="s2-section-toggle" data-target="sent-jp-wrap-${sent.id}" style="
        display:flex;align-items:center;gap:6px;background:none;border:none;
        font-family:'Noto Serif JP',serif;font-size:0.68rem;letter-spacing:0.2em;
        color:var(--muted);cursor:pointer;padding:4px 0;width:100%;text-align:left">
        <span class="toggle-icon">▼</span> 日本語の意味（自然な翻訳）
      </button>
      <div id="sent-jp-wrap-${sent.id}">
        <textarea class="sent-japanese" rows="2" placeholder="日本語の意味">${sent.japanese || ''}</textarea>
      </div>
    </div>

    <!-- ▼ プレビュー -->
    <div>
      <button class="s2-section-toggle preview-section-toggle" data-target="sent-preview-wrap-${sent.id}" style="
        display:flex;align-items:center;gap:6px;background:none;border:none;
        font-family:'Noto Serif JP',serif;font-size:0.68rem;letter-spacing:0.2em;
        color:var(--muted);cursor:pointer;padding:4px 0;width:100%;text-align:left">
        <span class="toggle-icon">▼</span> プレビュー
      </button>
      <div id="sent-preview-wrap-${sent.id}" style="display:flex;flex-direction:column;gap:10px;margin-top:6px">

        <!-- スペイン語インタラクティブ表示 -->
        <div>
          <div style="font-size:0.62rem;letter-spacing:0.2em;color:var(--muted);margin-bottom:5px">スペイン語</div>
          <div class="preview-wrap s2-spanish-preview" id="s2-preview-spanish-${sent.id}"
            style="line-height:2;padding:10px 12px;cursor:pointer;min-height:36px">
          </div>
          <div class="preview-meaning-bubble" id="s2-preview-bubble-${sent.id}" style="display:none"></div>
        </div>

        <!-- チャンク直訳 -->
        <div id="s2-preview-chunk-wrap-${sent.id}">
          <div style="font-size:0.62rem;letter-spacing:0.2em;color:var(--muted);margin-bottom:5px">チャンク直訳</div>
          <div class="chunk-literal-preview s2-chunk-literal-interactive" id="s2-preview-chunks-${sent.id}"
            style="line-height:2.2;padding:8px 10px;cursor:pointer;min-height:32px">
          </div>
        </div>

        <!-- ＋ 自然な翻訳 -->
        <div>
          <button class="s2-jp-reveal-btn" id="s2-jp-reveal-${sent.id}" style="
            background:none;border:1px solid color-mix(in srgb,var(--earth) 35%,transparent);
            color:var(--muted);padding:6px 14px;font-family:'Noto Serif JP',serif;
            font-size:0.75rem;letter-spacing:0.1em;cursor:pointer;transition:0.2s">
            ＋ 自然な翻訳を表示
          </button>
          <div id="s2-jp-text-${sent.id}" style="display:none;margin-top:6px;
            padding:10px 12px;background:color-mix(in srgb,var(--earth) 5%,var(--surface));
            border:1px solid color-mix(in srgb,var(--earth) 15%,transparent);
            font-size:0.88rem;line-height:1.9;color:var(--text)">
          </div>
        </div>

      </div>
    </div>

    </div><!-- /sent-block-body -->
  `

  // センテンス削除
  block.querySelector('.btn-sentence-delete').addEventListener('click', async (e) => {
    e.stopPropagation()
    if (!confirm('このセンテンスを削除しますか？')) return
    await db.from('audio_sentence_vocab').delete().eq('sentence_id', sent.id)
    await db.from('audio_sentence_chunks').delete().eq('sentence_id', sent.id)
    await db.from('audio_sentences').delete().eq('id', sent.id)
    audioItems[audioIdx].sentences = audioItems[audioIdx].sentences.filter(s => s.id !== sent.id)
    block.remove()
  })

  // 日本語意味 保存
  block.querySelector('.sent-japanese').addEventListener('blur', async (e) => {
    const val = e.target.value
    await db.from('audio_sentences').update({ japanese: val }).eq('id', sent.id)
    // audioItems内のsentenceも同期
    for (const item of audioItems) {
      if (!item.sentences) continue
      const s = item.sentences.find(s => s.id === sent.id)
      if (s) { s.japanese = val; break }
    }
  })

  // センテンスブロック本体 折りたたみ
  block.querySelector('.sent-block-header').addEventListener('click', (e) => {
    if (e.target.closest('button')) return
    const body = document.getElementById(`sent-body-${sent.id}`)
    const icon = block.querySelector('.sent-block-header .audio-toggle-icon')
    const preview = block.querySelector('.sent-header-preview')
    if (!body) return
    const isOpen = body.style.display !== 'none'
    body.style.display = isOpen ? 'none' : 'block'
    icon.textContent = isOpen ? '▶' : '▼'
    preview.style.display = isOpen ? 'inline' : 'none'
  })

  // セクション折りたたみ
  block.querySelectorAll('.s2-section-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target
      const target = document.getElementById(targetId)
      if (!target) return
      const isOpen = target.style.display !== 'none'
      target.style.display = isOpen ? 'none' : 'block'
      btn.querySelector('.toggle-icon').textContent = isOpen ? '▶' : '▼'
    })
  })

  loadChunksForSentence(sent, block)

  // ===== プレビューセクション初期化 =====
  initSentencePreview(sent, block)

  wrap.appendChild(block)
}

// ===== Step2 プレビューセクション =====
function initSentencePreview(sent, block) {
  // ＋ 自然な翻訳ボタン
  const revealBtn = block.querySelector(`#s2-jp-reveal-${sent.id}`)
  const jpText = block.querySelector(`#s2-jp-text-${sent.id}`)
  if (revealBtn && jpText) {
    revealBtn.addEventListener('click', () => {
      const japanese = block.querySelector('.sent-japanese')?.value || sent.japanese || ''
      if (!japanese.trim()) {
        jpText.textContent = '（未入力）'
      } else {
        jpText.textContent = japanese
      }
      const isShown = jpText.style.display !== 'none'
      jpText.style.display = isShown ? 'none' : 'block'
      revealBtn.textContent = isShown ? '＋ 自然な翻訳を表示' : '− 自然な翻訳を閉じる'
    })
  }

  // プレビューセクション折りたたみ
  block.querySelectorAll('.preview-section-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target
      const target = document.getElementById(targetId)
      if (!target) return
      const isOpen = target.style.display !== 'none'
      target.style.display = isOpen ? 'none' : 'flex'
      btn.querySelector('.toggle-icon').textContent = isOpen ? '▶' : '▼'
      if (!isOpen) renderS2SpanishPreview(sent, block)
    })
  })

  // 初回描画
  renderS2SpanishPreview(sent, block)
}

// ===== ここが修正箇所 =====
// スペイン語インタラクティブ表示を描画
async function renderS2SpanishPreview(sent, block) {
  const spanishEl = block.querySelector(`#s2-preview-spanish-${sent.id}`)
  const bubble = block.querySelector(`#s2-preview-bubble-${sent.id}`)
  if (!spanishEl) return

  // チャンクデータ取得（現在のDOM入力値 or DB）
  const { data: chunks } = await db.from('audio_sentence_chunks')
    .select('*').eq('sentence_id', sent.id).order('sort_order')

  // 語彙データ取得
  const { data: vocabData } = await db.from('audio_sentence_vocab')
    .select('*').eq('sentence_id', sent.id)
  const vocabMap = {}
  if (vocabData) vocabData.forEach(v => { vocabMap[v.spanish] = v.selected_meaning || '' })

  // チャンク直訳プレビュー更新
  renderS2ChunkLiteral(sent, block, chunks || [])

  spanishEl.innerHTML = ''

  if (!chunks || chunks.length === 0) {
    spanishEl.textContent = sent.spanish_display || ''
    return
  }

  let activeChunkEl = null

  // 展開中チャンクを元のテキストに戻す
  function collapseChunk(chunkSpan) {
    chunkSpan.innerHTML = ''
    chunkSpan.textContent = chunkSpan.dataset.originalText
    chunkSpan.classList.remove('active')
  }

  function resetAll() {
    if (activeChunkEl) collapseChunk(activeChunkEl)
    spanishEl.querySelectorAll('.s2-chunk-token').forEach(el => el.classList.remove('active'))
    bubble.style.display = 'none'
    activeChunkEl = null
  }

  function showBubble(text) {
    if (!text) { bubble.style.display = 'none'; return }
    bubble.textContent = text
    bubble.style.display = 'inline-block'
  }

  chunks.forEach((chunk, ci) => {
    const chunkSpan = document.createElement('span')
    chunkSpan.className = 's2-chunk-token preview-token'
    chunkSpan.dataset.chunkIdx = ci
    chunkSpan.dataset.originalText = chunk.spanish_chunk
    if (ci > 0) spanishEl.appendChild(document.createTextNode(' '))

    // チャンク内のサブトークン（leafTokens: phraseの親は含めず子のみ）
    const raw = chunk.spanish_raw || chunk.spanish_chunk
    const tokens = parseTokens(raw)
    const leafTokens = getLeafTokens(tokens)
    const hasSubTokens = leafTokens.length > 1 ||
      (leafTokens.length === 1 && leafTokens[0].type !== 'word')

    chunkSpan.textContent = chunk.spanish_chunk

    chunkSpan.addEventListener('click', (e) => {
      e.stopPropagation()

      if (activeChunkEl && activeChunkEl !== chunkSpan) {
        // 別のチャンク選択 → 現在のを閉じてリセット
        collapseChunk(activeChunkEl)
        spanishEl.querySelectorAll('.s2-chunk-token').forEach(el => el.classList.remove('active'))
        bubble.style.display = 'none'
        activeChunkEl = null
      }

      if (activeChunkEl === chunkSpan) {
        // 同チャンク再タップ → リセット
        resetAll()
        return
      }

      // 1回目タップ: ハイライト＋直訳バブル＋サブトークン展開（同時）
      activeChunkEl = chunkSpan
      chunkSpan.classList.add('active')

      // チャンクの直訳を取得
      const jpInputs = block.querySelectorAll('.chunk-block-item')
      let chunkJp = chunk.japanese_chunk || ''
      if (jpInputs[ci]) {
        const inp = jpInputs[ci].querySelector('.chunk-jp-input')
        if (inp) chunkJp = inp.value || chunkJp
      }
      showBubble(chunkJp || chunk.spanish_chunk)

      // サブトークンがあれば即展開（内部の単語・表現を個別タップ可能にする）
      if (hasSubTokens) {
        expandChunkToSubs(chunkSpan, leafTokens, vocabMap, bubble, showBubble)
      }
    })

    spanishEl.appendChild(chunkSpan)
  })

  // 余白クリック → リセット
  spanishEl.addEventListener('click', (e) => {
    if (e.target === spanishEl) resetAll()
  })
}

// チャンクをサブトークンに展開（1回目タップと同時に実行）
function expandChunkToSubs(chunkSpan, leafTokens, vocabMap, bubble, showBubble) {
  chunkSpan.innerHTML = ''
  chunkSpan.classList.add('active')

  leafTokens.forEach((token, ti) => {
    if (ti > 0) chunkSpan.appendChild(document.createTextNode(' '))
    const subSpan = document.createElement('span')
    subSpan.className = `s2-sub-token preview-token ${token.type}`
    // 表示テキスト: displayTextがあれば元の記号付き文字列、なければtext
    subSpan.textContent = token.displayText || token.text
    if (token.type !== 'silent') {
      subSpan.addEventListener('click', (e) => {
        e.stopPropagation()
        chunkSpan.querySelectorAll('.s2-sub-token').forEach(el => el.classList.remove('active'))
        subSpan.classList.add('active')
        const meaning = vocabMap[token.text] || ''
        if (meaning) {
          showBubble(`${token.text} — ${meaning}`)
        } else {
          showBubble(token.text)
        }
      })
    }
    chunkSpan.appendChild(subSpan)
  })
}

// チャンク直訳インタラクティブ表示
function renderS2ChunkLiteral(sent, block, chunks) {
  const litEl = block.querySelector(`#s2-preview-chunks-${sent.id}`)
  const bubble = block.querySelector(`#s2-preview-bubble-${sent.id}`)
  const spanishEl = block.querySelector(`#s2-preview-spanish-${sent.id}`)
  if (!litEl) return

  litEl.innerHTML = ''

  if (!chunks || chunks.length === 0) {
    litEl.textContent = '（チャンク未登録）'
    litEl.style.color = 'var(--muted)'
    return
  }
  litEl.style.color = ''

  chunks.forEach((chunk, ci) => {
    if (ci > 0) {
      const sep = document.createElement('span')
      sep.textContent = '／'
      sep.style.cssText = 'color:var(--muted);margin:0 2px'
      litEl.appendChild(sep)
    }

    // DOM上の最新直訳値を取得
    const jpInputs = block.querySelectorAll('.chunk-block-item')
    let jpText = chunk.japanese_chunk || chunk.spanish_chunk
    if (jpInputs[ci]) {
      const inp = jpInputs[ci].querySelector('.chunk-jp-input')
      if (inp && inp.value.trim()) jpText = inp.value.trim()
    }

    const span = document.createElement('span')
    span.className = 'chunk-literal-item'
    span.textContent = jpText
    span.style.cssText = 'cursor:pointer;padding:1px 3px;border-radius:2px;transition:background 0.15s'

    span.addEventListener('click', (e) => {
      e.stopPropagation()
      litEl.querySelectorAll('.chunk-literal-item').forEach(el => el.classList.remove('highlight'))
      span.classList.add('highlight')
      bubble.textContent = chunk.spanish_chunk
      bubble.style.display = 'inline-block'
      if (spanishEl) {
        spanishEl.querySelectorAll('.s2-chunk-token').forEach(el => el.classList.remove('active'))
        const chunkTokens = spanishEl.querySelectorAll('.s2-chunk-token')
        if (chunkTokens[ci]) chunkTokens[ci].classList.add('active')
      }
    })
    litEl.appendChild(span)
  })
}

// ===== チャンクブロック（新UI）: チャンクごとにスペイン語+直訳+語彙リスト =====
async function renderChunkBlocks(sent, block, chunks) {
  const chunksWrap = block.querySelector(`#chunk-blocks-${sent.id}`)
  const literalPreview = block.querySelector(`#chunk-literal-${sent.id}`)
  chunksWrap.innerHTML = ''

  if (chunks.length === 0) {
    literalPreview.style.display = 'none'
    return
  }

  // 既存の語彙データをまとめて取得
  const { data: existingVocab } = await db.from('audio_sentence_vocab')
    .select('*').eq('sentence_id', sent.id).order('sort_order')
  const existingVocabMap = {}
  if (existingVocab) existingVocab.forEach(v => { existingVocabMap[v.spanish] = v })

  const { data: lookupData } = await db.from('lookup_forms')
    .select('form, entry_id, dictionary_entries(id, spanish, japanese)')
  const lookupMap = buildLookupMap(lookupData || [])

  const chunkIdMap = {}
  chunks.forEach(c => { if (c.id) chunkIdMap[c.spanish_chunk + '_' + c.sort_order] = c.id })

  function updateLiteralPreview() {
    const parts = [...chunksWrap.querySelectorAll('.chunk-block-item')].map(el => {
      const inp = el.querySelector('.chunk-jp-input')
      return (inp && inp.value.trim()) ? inp.value.trim() : '…'
    })
    if (parts.length > 0) {
      literalPreview.textContent = parts.join('／')
      literalPreview.style.display = 'block'
    } else {
      literalPreview.style.display = 'none'
    }
  }

  // japanese_chunkをidで直接updateする（insert/deleteしない）
  async function saveChunkJp(chunkId, value) {
    if (!chunkId) return
    await db.from('audio_sentence_chunks')
      .update({ japanese_chunk: value })
      .eq('id', chunkId)
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]

    const raw = chunk.spanish_raw || chunk.spanish_chunk
    const tokens = parseTokens(raw)
    const flatTokens = flattenTokens(tokens)
    // 語彙登録用: expressionは1トークンとして扱い、phraseの子のみ個別展開
    const vocabTokens = getLeafTokens(tokens)

    const spanishList = [...new Set(vocabTokens.map(t => t.text))]
    const { data: meanings } = await db.from('vocab_meanings')
      .select('*').in('spanish', spanishList)
    const meaningsMap = {}
    if (meanings) meanings.forEach(m => { meaningsMap[m.spanish] = m.meanings || [] })

    const typeLabel = chunk.chunk_type === 'phrase' ? 'フレーズ'
      : chunk.chunk_type === 'expression' ? '表現' : ''

    const chunkEl = document.createElement('div')
    chunkEl.className = 'chunk-block-item'
    chunkEl.dataset.chunkKey = chunk.spanish_chunk
    chunkEl.dataset.chunkRaw = chunk.spanish_raw || chunk.spanish_chunk
    chunkEl.dataset.chunkType = chunk.chunk_type || 'word'
    chunkEl.style.cssText = `
      border:1px solid color-mix(in srgb,var(--earth) 20%,transparent);
      background:var(--surface);
      padding:10px 12px;
      display:flex;flex-direction:column;gap:8px;
    `

    chunkEl.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:0.65rem;letter-spacing:0.2em;color:var(--accent)">
              チャンク ${ci + 1}
            </span>
            ${typeLabel ? `<span style="font-size:0.58rem;padding:1px 5px;
              background:color-mix(in srgb,var(--earth) 15%,transparent);
              color:var(--earth)">${typeLabel}</span>` : ''}
          </div>
          <div style="font-size:0.9rem;color:var(--text);margin-bottom:8px;line-height:1.6">
            ${chunk.spanish_chunk}
          </div>
          <input type="text" class="chunk-jp-input"
            placeholder="日本語直訳"
            value="${chunk.japanese_chunk || ''}"
            style="width:100%" />
        </div>
      </div>

      <!-- 語彙リスト（折りたたみ可） -->
      <div>
        <button class="s2-section-toggle chunk-vocab-toggle" data-target="chunk-vocab-${sent.id}-${ci}" style="
          display:flex;align-items:center;gap:5px;background:none;border:none;
          font-family:'Noto Serif JP',serif;font-size:0.65rem;letter-spacing:0.15em;
          color:var(--muted);cursor:pointer;padding:2px 0;width:100%;text-align:left">
          <span class="toggle-icon">▼</span> 語彙登録 (${vocabTokens.length}語)
        </button>
        <div id="chunk-vocab-${sent.id}-${ci}" class="chunk-vocab-list"
          style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
        </div>
      </div>
    `

    const jpInput = chunkEl.querySelector('.chunk-jp-input')
    const chunkId = chunk.id || null
    let chunkSaveTimer = null
    jpInput.addEventListener('input', () => {
      updateLiteralPreview()
      renderS2ChunkLiteral(sent, block, chunks)
      // 1秒後に自動保存（debounce）
      clearTimeout(chunkSaveTimer)
      chunkSaveTimer = setTimeout(() => saveChunkJp(chunkId, jpInput.value.trim()), 1000)
    })
    jpInput.addEventListener('blur', () => {
      clearTimeout(chunkSaveTimer)
      saveChunkJp(chunkId, jpInput.value.trim())
    })

    chunkEl.querySelector('.chunk-vocab-toggle').addEventListener('click', (e) => {
      const targetId = e.currentTarget.dataset.target
      const target = document.getElementById(targetId)
      if (!target) return
      const isOpen = target.style.display !== 'none'
      target.style.display = isOpen ? 'none' : 'flex'
      e.currentTarget.querySelector('.toggle-icon').textContent = isOpen ? '▶' : '▼'
    })

    const vocabListEl = chunkEl.querySelector(`#chunk-vocab-${sent.id}-${ci}`)
    vocabListEl.style.display = 'flex'

    vocabTokens.forEach((token, ti) => {
      const existing = existingVocabMap[token.text]
      const rawMs = meaningsMap[token.text] || []
      const ms = [...new Set(rawMs)]
      const selectedMeaning = existing?.selected_meaning || ms[0] || ''
      const dictMatch = checkDictMatch(token.text, lookupMap)
      const dictStatus = dictMatch ? 'registered' : 'unregistered'
      const tokTypeLabel = token.type === 'phrase' ? 'フレーズ'
        : token.type === 'expression' ? '表現' : '単語'
      const tokTypeClass = `vocab-type-${token.type === 'expression' ? 'expression' : 'word'}`

      const vocabRow = document.createElement('div')
      vocabRow.style.cssText = `
        padding:8px 10px;
        background:var(--bg);
        border:1px solid color-mix(in srgb,var(--earth) 15%,transparent);
        display:flex;flex-direction:column;gap:6px;
        width:100%;
      `
      vocabRow.dataset.spanish = token.text

      vocabRow.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span class="vocab-type-badge ${tokTypeClass}">${tokTypeLabel}</span>
            <span style="font-size:0.85rem">${token.text}</span>
            ${token.parentText ? `<span style="font-size:0.62rem;color:var(--muted)">（${token.parentText}内）</span>` : ''}
          </div>
          <button class="btn-dict ${dictStatus}" style="font-size:0.62rem;flex-shrink:0">
            ${dictStatus === 'registered' ? '確認・編集' : '辞書登録'}
          </button>
        </div>
        <div class="vocab-meaning-area" style="display:flex;flex-direction:column;gap:4px"></div>
      `

      vocabRow.querySelector('.btn-dict').addEventListener('click', () => {
        currentDictVocabInfo = { token, sentId: sent.id }
        openDictPopup(token.text, dictStatus, dictMatch?.entry_id || null)
      })

      const meaningArea = vocabRow.querySelector('.vocab-meaning-area')
      const currentMeanings = [...ms]
      let currentSelected = selectedMeaning

      function renderInlineMeanings() {
        meaningArea.innerHTML = ''

        currentMeanings.forEach((m, mi) => {
          const isSelected = m === currentSelected
          const mRow = document.createElement('div')
          mRow.style.cssText = `display:flex;align-items:center;gap:5px`
          mRow.innerHTML = `
            <div class="meaning-select-btn" style="
              flex:1;padding:5px 8px;font-size:0.82rem;cursor:pointer;
              background:${isSelected ? 'color-mix(in srgb,var(--accent) 8%,var(--surface))' : 'var(--surface)'};
              border:1px solid ${isSelected ? 'var(--accent)' : 'color-mix(in srgb,var(--earth) 20%,transparent)'};
              display:flex;align-items:center;gap:5px">
              <span style="flex:1">${m}</span>
              ${isSelected ? '<span style="font-size:0.6rem;color:var(--accent)">✓</span>' : ''}
            </div>
            <button class="btn-edit-meaning" style="background:none;border:1px solid var(--earth);color:var(--earth);
              font-size:0.6rem;padding:3px 6px;cursor:pointer;font-family:'Noto Serif JP',serif;flex-shrink:0">編集</button>
            <button class="btn-del-meaning" style="background:none;border:1px solid var(--muted);color:var(--muted);
              font-size:0.6rem;padding:3px 6px;cursor:pointer;font-family:'Noto Serif JP',serif;flex-shrink:0">削除</button>
          `
          mRow.querySelector('.meaning-select-btn').addEventListener('click', async () => {
            currentSelected = m
            await saveVocabEntry(sent, token, m, dictMatch?.entry_id || existing?.dictionary_entry_id || null)
            renderInlineMeanings()
          })
          mRow.querySelector('.btn-edit-meaning').addEventListener('click', async () => {
            const newVal = prompt('意味を編集してください', m)
            if (!newVal || newVal.trim() === m) return
            const trimmed = newVal.trim()
            const { data: vm } = await db.from('vocab_meanings').select('*').eq('spanish', token.text).maybeSingle()
            if (vm) {
              const updated = [...new Set(vm.meanings.map(x => x === m ? trimmed : x))]
              await db.from('vocab_meanings').update({ meanings: updated }).eq('id', vm.id)
              currentMeanings[mi] = trimmed
              if (currentSelected === m) {
                currentSelected = trimmed
                await saveVocabEntry(sent, token, trimmed, dictMatch?.entry_id || existing?.dictionary_entry_id || null)
              }
              renderInlineMeanings()
            }
          })
          mRow.querySelector('.btn-del-meaning').addEventListener('click', async () => {
            if (!confirm(`「${m}」を削除しますか？`)) return
            const { data: vm } = await db.from('vocab_meanings').select('*').eq('spanish', token.text).maybeSingle()
            if (vm) {
              const updated = vm.meanings.filter(x => x !== m)
              await db.from('vocab_meanings').update({ meanings: updated }).eq('id', vm.id)
              currentMeanings.splice(mi, 1)
              if (currentSelected === m) currentSelected = currentMeanings[0] || ''
              renderInlineMeanings()
            }
          })
          meaningArea.appendChild(mRow)
        })

        const addRow = document.createElement('div')
        addRow.style.cssText = 'display:flex;gap:5px;align-items:center;margin-top:2px'
        addRow.innerHTML = `
          <input type="text" placeholder="新しい意味を追加"
            style="flex:1;font-size:0.78rem;padding:5px 8px;background:var(--bg);
            border:1px solid color-mix(in srgb,var(--earth) 30%,transparent);
            font-family:'Noto Serif JP',serif;color:var(--text);outline:none" />
          <button style="background:var(--earth);color:var(--surface);border:none;
            padding:5px 10px;font-family:'Noto Serif JP',serif;font-size:0.72rem;cursor:pointer">追加</button>
        `
        const addInput = addRow.querySelector('input')
        const addBtn = addRow.querySelector('button')
        async function doAdd() {
          const val = addInput.value.trim()
          if (!val || currentMeanings.includes(val)) return
          await saveVocabMeaning(token.text, val)
          currentMeanings.push(val)
          if (!currentSelected) currentSelected = val
          await saveVocabEntry(sent, token, currentSelected, dictMatch?.entry_id || existing?.dictionary_entry_id || null)
          addInput.value = ''
          renderInlineMeanings()
        }
        addBtn.addEventListener('click', doAdd)
        addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd() } })
        meaningArea.appendChild(addRow)
      }

      renderInlineMeanings()
      vocabListEl.appendChild(vocabRow)
    })

    chunksWrap.appendChild(chunkEl)
  }

  updateLiteralPreview()
  renderS2SpanishPreview(sent, block)
}

// 語彙エントリを1件保存（upsert風）
async function saveVocabEntry(sent, token, selectedMeaning, dictEntryId) {
  const session = await db.auth.getSession()
  const userId = session.data.session.user.id
  await db.from('audio_sentence_vocab')
    .delete()
    .eq('sentence_id', sent.id)
    .eq('spanish', token.text)
  await db.from('audio_sentence_vocab').insert({
    sentence_id: sent.id,
    material_id: materialId,
    spanish: token.text,
    type: token.type,
    selected_meaning: selectedMeaning,
    dictionary_entry_id: dictEntryId || null,
    sort_order: 0,
    user_id: userId
  })
  if (selectedMeaning) await saveVocabMeaning(token.text, selectedMeaning)
}

// ===== センテンスパース：| 区切り対応 =====
function parseSentences(raw) {
  if (raw.includes('|')) {
    const parts = raw.split('|').map(s => s.trim()).filter(s => s.length > 0)
    if (parts.length > 0) return parts
  }
  if (raw.includes('/')) {
    const parts = raw.split('/').map(s => s.trim()).filter(s => s.length > 0)
    if (parts.length > 0) return parts
  }
  return [raw]
}

// チャンクデータを解析してブロック描画
async function loadChunksForSentence(sent, block) {
  const { data: existingChunks } = await db.from('audio_sentence_chunks')
    .select('*').eq('sentence_id', sent.id).order('sort_order')

  const chunkInput = block.querySelector('.chunk-spanish-input')
  const goBtn = block.querySelector('.btn-chunk-go')

  // このセンテンスのchunk状態をローカルで管理する配列
  let currentChunks = []

  if (existingChunks && existingChunks.length > 0) {
    const restored = existingChunks
      .map(c => c.spanish_raw || c.spanish_chunk)
      .join('/')
    chunkInput.value = restored
    currentChunks = existingChunks
    await renderChunkBlocks(sent, block, currentChunks)
  } else if (sent.chunk_input) {
    chunkInput.value = sent.chunk_input
  }

  // チャンク入力テキストをblur時に自動保存
  chunkInput.addEventListener('blur', async (e) => {
    const val = e.target.value.trim()
    if (!val) return
    await db.from('audio_sentences')
      .update({ chunk_input: val })
      .eq('id', sent.id)
  })

  goBtn.addEventListener('click', async () => {
    const raw = chunkInput.value.trim()
    if (!raw) return

    const rawParts = raw.split('/').map(s => s.trim()).filter(s => s.length > 0)
    if (rawParts.length === 0) return

    const chunkLabels = rawParts.map(p => {
      const tokens = parseTokens(p)
      if (tokens.length === 1) {
        // 単一トークンの場合はそのtextをdisplayに
        return { display: tokens[0].text, type: tokens[0].type, raw: p }
      }
      // 複数トークン: 記号除去したテキストをdisplayに
      return { display: stripSymbols(p), type: 'word', raw: p }
    })

    // 現在のDOMから直訳を収集（key→value）
    const currentJpMap = {}
    block.querySelectorAll('.chunk-block-item').forEach(el => {
      const key = el.dataset.chunkKey
      const val = el.querySelector('.chunk-jp-input')?.value
      if (key && val !== undefined) currentJpMap[key] = val
    })

    // チャンク構成が変わっていなければ再insert不要
    // spanish_rawも比較して[]→()のような記法変更も検知する
    const isSameStructure = currentChunks.length === chunkLabels.length &&
      currentChunks.every((c, i) =>
        c.spanish_chunk === chunkLabels[i].display &&
        (c.spanish_raw || c.spanish_chunk) === chunkLabels[i].raw
      )

    if (isSameStructure && currentChunks.length > 0) {
      // 構成変化なし → 直訳とspanish_rawをDBに保存して再描画
      for (let i = 0; i < currentChunks.length; i++) {
        const jp = currentJpMap[currentChunks[i].spanish_chunk] ?? currentChunks[i].japanese_chunk ?? ''
        const newRaw = chunkLabels[i].raw
        currentChunks[i] = { ...currentChunks[i], japanese_chunk: jp, spanish_raw: newRaw }
        if (currentChunks[i].id) {
          await db.from('audio_sentence_chunks')
            .update({ japanese_chunk: jp, spanish_raw: newRaw })
            .eq('id', currentChunks[i].id)
        }
      }
      await renderChunkBlocks(sent, block, currentChunks)
      return
    }

    // 構成が変わった場合のみ再insert
    const newDisplayKeys = chunkLabels.map(c => c.display)
    const missingKeys = newDisplayKeys.filter(k => !(k in currentJpMap))
    let cacheMap = {}
    if (missingKeys.length > 0) {
      const { data: cached } = await db.from('audio_sentence_chunks')
        .select('spanish_chunk, japanese_chunk')
        .eq('sentence_id', sent.id)
        .in('spanish_chunk', missingKeys)
      if (cached) cached.forEach(c => {
        if (!cacheMap[c.spanish_chunk] && c.japanese_chunk) cacheMap[c.spanish_chunk] = c.japanese_chunk
      })
      const stillMissing = missingKeys.filter(k => !cacheMap[k])
      if (stillMissing.length > 0) {
        const { data: globalCached } = await db.from('audio_sentence_chunks')
          .select('spanish_chunk, japanese_chunk').in('spanish_chunk', stillMissing)
        if (globalCached) globalCached.forEach(c => {
          if (!cacheMap[c.spanish_chunk] && c.japanese_chunk) cacheMap[c.spanish_chunk] = c.japanese_chunk
        })
      }
    }

    const newChunks = chunkLabels.map((cl, i) => ({
      spanish_chunk: cl.display,
      spanish_raw: cl.raw,
      japanese_chunk: (cl.display in currentJpMap) ? currentJpMap[cl.display] : (cacheMap[cl.display] || ''),
      sort_order: i
    }))

    await db.from('audio_sentence_chunks').delete().eq('sentence_id', sent.id)
    if (newChunks.length > 0) {
      const insertData = newChunks.map(c => ({
        sentence_id: sent.id,
        material_id: materialId,
        spanish_chunk: c.spanish_chunk,
        spanish_raw: c.spanish_raw,
        japanese_chunk: c.japanese_chunk,
        sort_order: c.sort_order
      }))
      const { data: saved, error: insertError } = await db.from('audio_sentence_chunks')
        .insert(insertData).select('id, sentence_id, material_id, spanish_chunk, spanish_raw, japanese_chunk, sort_order')
      if (insertError) {
        console.error('chunk insert error:', insertError)
      }
      currentChunks = saved || newChunks
      await renderChunkBlocks(sent, block, currentChunks)
    } else {
      currentChunks = []
      await renderChunkBlocks(sent, block, [])
    }
  })
}

// ===== Step 3: 音声紐付け =====
async function initStep3() {
  const container = document.getElementById('timing-audio-blocks')
  container.innerHTML = ''

  const { data: material } = await db.from('audio_materials').select('youtube_id').eq('id', materialId).single()
  if (material?.youtube_id) document.getElementById('yt-id-input').value = material.youtube_id

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

  let sentencesHTML = ''
  if (hasSentences) {
    sentencesHTML = item.sentences.map((sent, si) => `
      <div class="sentence-block" id="timing-sentence-${sent.id}">
        <div class="sentence-label">センテンス ${si + 1}</div>
        <div class="display-preview" style="margin-bottom:8px">${sent.spanish_display || ''}</div>
        <div class="sentence-sec-row">
          <div class="sec-input-wrap">
            <label>開始秒</label>
            <input type="number" class="sent-start" min="0" step="0.1"
              value="${sent.start_sec ?? ''}" placeholder="未設定" style="width:88px" />
          </div>
          <button class="btn-mark btn-mark-start sent-mark-start" style="font-size:0.7rem;padding:6px 8px">▶ ここから</button>
          <div class="sec-input-wrap">
            <label>終了秒</label>
            <input type="number" class="sent-end" min="0" step="0.1"
              value="${sent.end_sec ?? ''}" placeholder="未設定" style="width:88px" />
          </div>
          <button class="btn-mark btn-mark-end sent-mark-end" style="font-size:0.7rem;padding:6px 8px">■ ここまで</button>
          <button class="btn-play-range sent-play" style="font-size:0.7rem;padding:5px 10px">▶</button>
        </div>
      </div>
    `).join('')
  }

  block.innerHTML = `
    <div class="audio-block-header audio-block-toggle" data-target="timing-audio-body-${idx}" style="cursor:pointer">
      <span class="audio-block-title">Audio ${item.audio_number}</span>
      <span class="audio-toggle-icon" style="font-size:0.65rem;color:var(--muted)">▼</span>
    </div>
    <div class="audio-block-body" id="timing-audio-body-${idx}">
      ${hasSentences ? `
        <div class="section-card-title" style="font-size:0.68rem;letter-spacing:0.2em;color:var(--muted)">
          センテンスごとの秒数
        </div>
        <div class="sentences-wrap" id="timing-sentences-${idx}">${sentencesHTML}</div>
      ` : '<div style="color:var(--muted);font-size:0.82rem">センテンス未登録</div>'}
    </div>
  `

  if (hasSentences) {
    item.sentences.forEach((sent, si) => {
      const sentBlock = block.querySelector(`#timing-sentence-${sent.id}`)
      if (!sentBlock) return

      sentBlock.querySelector('.sent-mark-start').addEventListener('click', async () => {
        if (!ytPlayer) return
        const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(1))
        sentBlock.querySelector('.sent-start').value = sec
        audioItems[idx].sentences[si].start_sec = sec
        await db.from('audio_sentences').update({ start_sec: sec }).eq('id', sent.id)
      })

      sentBlock.querySelector('.sent-mark-end').addEventListener('click', async () => {
        if (!ytPlayer) return
        const sec = parseFloat(ytPlayer.getCurrentTime().toFixed(1))
        sentBlock.querySelector('.sent-end').value = sec
        audioItems[idx].sentences[si].end_sec = sec
        await db.from('audio_sentences').update({ end_sec: sec }).eq('id', sent.id)
      })

      sentBlock.querySelector('.sent-play').addEventListener('click', () => {
        if (!ytPlayer) return
        const start = parseFloat(sentBlock.querySelector('.sent-start').value) || 0
        const end = parseFloat(sentBlock.querySelector('.sent-end').value) || null
        if (!start && start !== 0) return
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

  block.querySelector('.audio-block-toggle').addEventListener('click', (e) => {
    if (e.target.closest('button, input')) return
    toggleAudioBody(block, `timing-audio-body-${idx}`)
  })

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

// ===== Step4 センテンス順番再生 =====
let sequentialTimer = null  // 再生中のタイマー（停止に使う）

function playSequential(sents, index) {
  // 前のタイマーをクリア
  if (sequentialTimer) { clearTimeout(sequentialTimer); sequentialTimer = null }
  if (!ytPlayer || index >= sents.length) return

  const sent = sents[index]
  const start = sent.start_sec
  const end = sent.end_sec
  const duration = (end - start) * 1000

  ytPlayer.seekTo(start, true)
  ytPlayer.playVideo()

  sequentialTimer = setTimeout(() => {
    if (index + 1 < sents.length) {
      // 次のセンテンスへ
      playSequential(sents, index + 1)
    } else {
      // 全て終了
      ytPlayer.pauseVideo()
      sequentialTimer = null
    }
  }, duration)
}

// ===== Step4 スペイン語インタラクティブ表示（Step2と同仕様） =====
async function renderPreviewSpanish(sent, chunks, sentVocabMap, sentBlock, bubble) {
  const spanishEl = sentBlock.querySelector(`#preview-${sent.id}`)
  if (!spanishEl) return

  // 語彙データは引数から受け取る（renderPreviewで一括取得済み）
  const vocabMap = sentVocabMap

  spanishEl.innerHTML = ''

  if (!chunks || chunks.length === 0) {
    spanishEl.textContent = sent.spanish_display || ''
    return
  }

  let activeChunkEl = null

  function collapseChunk(chunkSpan) {
    chunkSpan.innerHTML = ''
    chunkSpan.textContent = chunkSpan.dataset.originalText
    chunkSpan.classList.remove('active')
  }

  function resetAll() {
    if (activeChunkEl) collapseChunk(activeChunkEl)
    spanishEl.querySelectorAll('.s2-chunk-token').forEach(el => el.classList.remove('active'))
    bubble.style.display = 'none'
    activeChunkEl = null
  }

  function showBubble(text) {
    if (!text) { bubble.style.display = 'none'; return }
    bubble.textContent = text
    bubble.style.display = 'inline-block'
  }

  chunks.forEach((chunk, ci) => {
    const chunkSpan = document.createElement('span')
    chunkSpan.className = 's2-chunk-token preview-token'
    chunkSpan.dataset.originalText = chunk.spanish_chunk
    if (ci > 0) spanishEl.appendChild(document.createTextNode(' '))

    const raw = chunk.spanish_raw || chunk.spanish_chunk
    const tokens = parseTokens(raw)
    const leafTokens = getLeafTokens(tokens)
    const hasSubTokens = leafTokens.length > 1 ||
      (leafTokens.length === 1 && leafTokens[0].type !== 'word')

    chunkSpan.textContent = chunk.spanish_chunk

    chunkSpan.addEventListener('click', (e) => {
      e.stopPropagation()

      if (activeChunkEl && activeChunkEl !== chunkSpan) {
        collapseChunk(activeChunkEl)
        spanishEl.querySelectorAll('.s2-chunk-token').forEach(el => el.classList.remove('active'))
        bubble.style.display = 'none'
        activeChunkEl = null
      }

      if (activeChunkEl === chunkSpan) {
        resetAll()
        return
      }

      activeChunkEl = chunkSpan
      chunkSpan.classList.add('active')
      showBubble(chunk.japanese_chunk || chunk.spanish_chunk)

      if (hasSubTokens) {
        expandChunkToSubs(chunkSpan, leafTokens, vocabMap, bubble, showBubble)
      }
    })

    spanishEl.appendChild(chunkSpan)
  })

  spanishEl.addEventListener('click', (e) => {
    if (e.target === spanishEl) resetAll()
  })
}

// ===== Step 4: プレビュー =====
async function renderPreview() {
  const container = document.getElementById('preview-blocks')
  container.innerHTML = ''

  const allSentIds = audioItems.flatMap(item => (item.sentences || []).map(s => s.id))
  let chunksMap = {}
  let vocabMap = {}
  let sentenceJapaneseMap = {}  // sentence_id → japanese（DBから最新取得）
  if (allSentIds.length > 0) {
    const [chunksRes, vocabRes, sentRes] = await Promise.all([
      db.from('audio_sentence_chunks').select('*').in('sentence_id', allSentIds).order('sort_order'),
      db.from('audio_sentence_vocab').select('*').in('sentence_id', allSentIds),
      db.from('audio_sentences').select('id, japanese').in('id', allSentIds)
    ])
    if (chunksRes.data) {
      chunksRes.data.forEach(c => {
        if (!chunksMap[c.sentence_id]) chunksMap[c.sentence_id] = []
        chunksMap[c.sentence_id].push(c)
      })
    }
    if (vocabRes.data) {
      vocabRes.data.forEach(v => {
        if (!vocabMap[v.sentence_id]) vocabMap[v.sentence_id] = {}
        vocabMap[v.sentence_id][v.spanish] = v.selected_meaning || ''
      })
    }
    if (sentRes.data) {
      sentRes.data.forEach(s => {
        sentenceJapaneseMap[s.id] = s.japanese || ''
      })
    }
  }

  audioItems.forEach((item, idx) => {
    const block = document.createElement('div')
    block.className = 'audio-block'
    block.style.marginBottom = '16px'

    const hasSentences = item.sentences && item.sentences.length > 0
    const startStr = formatSec(item.start_sec || 0)
    const endStr = item.end_sec != null ? formatSec(item.end_sec) : '未設定'

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
      block.innerHTML = `
        <div class="audio-block-header" style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:10px">
            <button class="btn-play-range preview-audio-play"
              style="font-size:0.72rem;padding:5px 12px;flex-shrink:0">
              ▶ Audio ${item.audio_number}
            </button>
            <span class="audio-block-range">${startStr} — ${endStr}</span>
          </div>
        </div>
        <div class="audio-block-body">
          <div class="sentences-wrap" id="preview-sentences-${idx}"></div>
        </div>
      `

      const sentWrap = block.querySelector(`#preview-sentences-${idx}`)

      // Audio全体順番再生
      const audioPlayBtn = block.querySelector('.preview-audio-play')
      if (audioPlayBtn) {
        audioPlayBtn.addEventListener('click', () => {
          if (!ytPlayer) return
          // 秒数設定済みのセンテンスだけ順番に再生
          const playableSents = item.sentences.filter(s =>
            s.start_sec != null && s.end_sec != null
          ).sort((a, b) => a.start_sec - b.start_sec)
          if (playableSents.length === 0) return
          playSequential(playableSents, 0)
        })
      }

      item.sentences.forEach((sent, si) => {
        const sStart = sent.start_sec != null ? formatSec(sent.start_sec) : startStr
        const sEnd = sent.end_sec != null ? formatSec(sent.end_sec) : endStr
        const chunks = chunksMap[sent.id] || []
        const hasChunks = chunks.length > 0
        // DBから取得した最新のjapaneseで判定（audioItemsの古いキャッシュを使わない）
        const latestJapanese = sentenceJapaneseMap[sent.id] ?? sent.japanese ?? ''
        const hasJapanese = !!(latestJapanese && latestJapanese.trim())

        const sentBlock = document.createElement('div')
        sentBlock.className = 'sentence-block'
        sentBlock.style.gap = '8px'
        sentBlock.id = `preview-sent-block-${sent.id}`

        sentBlock.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <button class="btn-play-range preview-play"
              data-start="${sent.start_sec ?? item.start_sec ?? 0}"
              data-end="${sent.end_sec ?? item.end_sec ?? ''}"
              style="font-size:0.7rem;padding:5px 10px;flex-shrink:0">
              ▶ ${sStart}–${sEnd}
            </button>
            <div class="preview-wrap" id="preview-${sent.id}"
              style="flex:1;min-width:0;padding:8px 12px;cursor:pointer;line-height:2">
            </div>
          </div>
          <div class="preview-meaning-bubble" id="bubble-${sent.id}" style="display:none"></div>

          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px">
            ${hasJapanese ? `
              <button class="preview-expand-btn" id="btn-expand-jp-${sent.id}">
                ＋ 日本語意味
              </button>
            ` : ''}
            ${hasChunks ? `
              <button class="preview-expand-btn" id="btn-expand-chunk-${sent.id}">
                ＋ チャンク直訳
              </button>
            ` : ''}
          </div>

          ${hasJapanese ? `
            <div class="preview-expand-panel" id="panel-jp-${sent.id}">
              ${latestJapanese}
            </div>
          ` : ''}

          ${hasChunks ? `
            <div class="preview-expand-panel" id="panel-chunk-${sent.id}">
              ${chunks.map((c, ci) => `
                <span class="chunk-literal-item"
                  data-spanish="${c.spanish_chunk}"
                  data-idx="${ci}"
                  data-sent="${sent.id}">
                  ${c.japanese_chunk || c.spanish_chunk}
                </span>
                ${ci < chunks.length - 1 ? '<span style="color:var(--muted);margin:0 1px">／</span>' : ''}
              `).join('')}
            </div>
          ` : ''}
        `

        sentWrap.appendChild(sentBlock)

        sentBlock.querySelector('.preview-play').addEventListener('click', () => {
          if (!ytPlayer) return
          const start = parseFloat(sentBlock.querySelector('.preview-play').dataset.start) || 0
          const end = parseFloat(sentBlock.querySelector('.preview-play').dataset.end) || null
          ytPlayer.seekTo(start, true)
          ytPlayer.playVideo()
          if (end) setTimeout(() => ytPlayer.pauseVideo(), (end - start) * 1000)
        })

        const bubble = sentBlock.querySelector(`#bubble-${sent.id}`)
        // Step2と同じインタラクティブ表示
        renderPreviewSpanish(sent, chunks, vocabMap[sent.id] || {}, sentBlock, bubble)

        if (hasJapanese) {
          const btnJp = sentBlock.querySelector(`#btn-expand-jp-${sent.id}`)
          const panelJp = sentBlock.querySelector(`#panel-jp-${sent.id}`)
          btnJp.addEventListener('click', () => {
            const isOpen = panelJp.classList.toggle('open')
            btnJp.classList.toggle('open', isOpen)
            btnJp.textContent = isOpen ? '− 日本語意味' : '＋ 日本語意味'
          })
        }

        if (hasChunks) {
          const btnChunk = sentBlock.querySelector(`#btn-expand-chunk-${sent.id}`)
          const panelChunk = sentBlock.querySelector(`#panel-chunk-${sent.id}`)
          btnChunk.addEventListener('click', () => {
            const isOpen = panelChunk.classList.toggle('open')
            btnChunk.classList.toggle('open', isOpen)
            btnChunk.textContent = isOpen ? '− チャンク直訳' : '＋ チャンク直訳'
          })

          panelChunk.querySelectorAll('.chunk-literal-item').forEach(item => {
            item.addEventListener('click', () => {
              panelChunk.querySelectorAll('.chunk-literal-item').forEach(el => el.classList.remove('highlight'))
              item.classList.add('highlight')
              const spChunk = item.dataset.spanish
              if (bubble) {
                bubble.textContent = spChunk
                bubble.style.display = 'inline-block'
              }
            })
          })
        }
      })
    }

    container.appendChild(block)
  })
}

// ===== Audioブロック 折りたたみ共通ヘルパー =====
function toggleAudioBody(block, bodyId) {
  const body = document.getElementById(bodyId)
  const icon = block.querySelector('.audio-block-header .audio-toggle-icon')
  if (!body || !icon) return
  const isOpen = body.style.display !== 'none'
  body.style.display = isOpen ? 'none' : 'block'
  icon.textContent = isOpen ? '▶' : '▼'
}

// ===== 秒数フォーマット =====
function formatSec(sec) {
  const totalSec = parseFloat(sec) || 0
  const m = Math.floor(totalSec / 60)
  const s = (totalSec % 60).toFixed(1)
  return `${m}:${String(s).padStart(4, '0')}`
}

// ===== 語彙ポップアップ（後方互換用） =====
async function openVocabPopup(sent, audioIdx) {
  console.log('openVocabPopup: deprecated in new UI')
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
    btn.addEventListener('click', async () => {
      if (currentDictVocabInfo) {
        const { token, sentId } = currentDictVocabInfo
        if (token && sentId) {
          await db.from('audio_sentence_vocab')
            .update({ dictionary_entry_id: btn.dataset.id })
            .eq('sentence_id', sentId)
            .eq('spanish', token.text)
        }
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
      // [] : フレーズ（細分化あり）- 記号含めて登録
      const end = findClosing(raw, i, '[', ']')
      const inner = raw.slice(i + 1, end)
      tokens.push({ type: 'phrase', text: stripSymbols(inner), children: parseInnerTokens(inner) })
      i = end + 1
    } else if (raw[i] === '{') {
      // {} : 表現（記号含めてそのまま登録）
      const end = findClosing(raw, i, '{', '}')
      const inner = raw.slice(i + 1, end).trim()
      tokens.push({ type: 'expression', text: inner })
      i = end + 1
    } else if (raw[i] === '(') {
      // () : 単語（細分化なし、記号含めて登録）
      const end = findClosing(raw, i, '(', ')')
      const inner = raw.slice(i + 1, end).trim()
      tokens.push({ type: 'expression', text: inner })
      i = end + 1
    } else if (raw[i] === '"') {
      // "" : 語彙登録なし（表示のみ）
      const end = raw.indexOf('"', i + 1)
      const inner = end > i ? raw.slice(i + 1, end).trim() : ''
      if (inner) tokens.push({ type: 'silent', text: inner })
      i = end > i ? end + 1 : i + 1
    } else if (raw[i] === ' ') {
      i++
    } else {
      let j = i
      while (j < raw.length && !' [](){}"\''.includes(raw[j])) j++
      const rawText = raw.slice(i, j)
      // 通常単語: 前後の句読点・疑問符等を除去して登録
      const text = stripPunctuation(rawText)
      if (text) tokens.push({ type: 'word', text, displayText: rawText })
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
      tokens.push({ type: 'expression', text: raw.slice(i + 1, end).trim() })
      i = end + 1
    } else if (raw[i] === ' ') { i++ }
    else {
      let j = i
      while (j < raw.length && !' ()'.includes(raw[j])) j++
      const rawText = raw.slice(i, j)
      // フレーズ内の単語も記号除去
      const text = stripPunctuation(rawText)
      if (text) tokens.push({ type: 'word', text, displayText: rawText })
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

// 表示用最小単位のトークンを取得
// phrase → その子トークン（phraseの親は含めない）
// word / expression → そのまま
function getLeafTokens(tokens, parentText) {
  const result = []
  tokens.forEach(t => {
    if (t.type === 'silent') {
      // ""で囲んだもの: 語彙登録しない
      return
    }
    if (t.type === 'phrase' && t.children && t.children.length > 0) {
      // phraseの親は含めず、子を再帰的に展開
      result.push(...getLeafTokens(t.children, t.text))
    } else {
      result.push({ ...t, parentText: parentText || null })
    }
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

function stripSymbols(str) {
  return str.replace(/[\[\](){}\|"]/g, '').replace(/\s+/g, ' ').trim()
}

// 単語の前後の句読点・疑問符・感嘆符を除去（語彙登録用）
function stripPunctuation(text) {
  return text.replace(/^[¿¡\s]+|[?!.,;:\s]+$/g, '').trim()
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

// ===== ステップインジケータークリック =====
;[1, 2, 3, 4].forEach(s => {
  document.getElementById(`step-${s}-indicator`).addEventListener('click', async () => {
    if (s > maxReachedStep) return
    if (s === currentStep) return

    if (s < currentStep) {
      if (s === 2 && audioItems.length === 0) { await initStep2() }
      if (s === 3 && document.getElementById('timing-audio-blocks').children.length === 0) { await initStep3() }
      showStep(s)
      return
    }

    if (currentStep === 1 && s > 1) {
      const ok = await createMaterial()
      if (!ok) return
      if (s === 2) { await initStep2(); showStep(2); return }
      await initStep2()
      if (s === 3) { await initStep3(); showStep(3); return }
      await initStep3()
      if (s === 4) { showStep(4) }
    } else if (currentStep === 2 && s > 2) {
      if (s === 3) { await initStep3(); showStep(3); return }
      await initStep3()
      if (s === 4) { showStep(4) }
    } else if (currentStep === 3 && s === 4) {
      showStep(4)
    }
  })
})

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

// ===== 保存 =====
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

  if (materialId) {
    const { data: mat } = await db.from('audio_materials').select('status, youtube_id').eq('id', materialId).single()
    if (mat) {
      if (mat.status === 'saved') {
        maxReachedStep = 4
      } else {
        const { data: items } = await db.from('audio_material_items')
          .select('id').eq('material_id', materialId).limit(1)
        if (items && items.length > 0) {
          maxReachedStep = 2
          if (mat.youtube_id) {
            maxReachedStep = 3
          }
          const { data: allItems } = await db.from('audio_material_items')
            .select('start_sec').eq('material_id', materialId)
          if (allItems && allItems.length > 0 && allItems.every(i => i.start_sec != null)) {
            maxReachedStep = 4
          }
        }
      }
    }
  }

  showStep(1)
})()

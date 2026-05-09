const SUPABASE_URL = 'https://nsprbshgkxywtwmimkcy.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcHJic2hna3h5d3R3bWlta2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzMxMDAsImV4cCI6MjA5MzkwOTEwMH0.g51y4rq3xEDYD9GJoux7UDBeOpXyqYLDptwQ3LHy6b8'
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ログインチェック
async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) window.location.href = '../login/login.html'
  return session
}

// 状態管理
let today = new Date()
let currentYear = today.getFullYear()
let currentMonth = today.getMonth()
let selectedDate = formatDate(today)
let allTasks = []

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// タスク取得
async function fetchTasks() {
  const { data, error } = await db.from('tasks').select('*').order('date')
  if (!error) allTasks = data
}

// カレンダー描画
function renderCalendar() {
  document.getElementById('calendar-month').textContent = MONTHS_ES[currentMonth]
  document.getElementById('btn-year').textContent = currentYear

  const days = document.getElementById('calendar-days')
  days.innerHTML = ''

  const firstDay = new Date(currentYear, currentMonth, 1).getDay()
  const offset = firstDay === 0 ? 6 : firstDay - 1
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

  const taskDates = new Set(allTasks.map(t => t.date))

  // 空白セル
  for (let i = 0; i < offset; i++) {
    const el = document.createElement('div')
    el.className = 'cal-day empty'
    days.appendChild(el)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const dow = new Date(currentYear, currentMonth, d).getDay()

    const el = document.createElement('div')
    el.className = 'cal-day'
    if (dow === 6) el.classList.add('cal-day-sat')
    if (dow === 0) el.classList.add('cal-day-sun')
    if (dateStr === formatDate(today)) el.classList.add('today')
    if (dateStr === selectedDate) el.classList.add('selected')

    el.innerHTML = `<div class="cal-day-num">${d}</div>`
    if (taskDates.has(dateStr)) {
      el.innerHTML += `<div class="cal-dot"></div>`
    }

    el.addEventListener('click', () => selectDate(dateStr))
    days.appendChild(el)
  }
}

// 日付選択
function selectDate(dateStr) {
  selectedDate = dateStr
  renderCalendar()
  renderTasks()
}

// タスク一覧描画
function renderTasks() {
  const list = document.getElementById('task-list')
  const empty = document.getElementById('task-empty')
  const label = document.getElementById('task-date-label')

  const [y, m, d] = selectedDate.split('-')
  const dateObj = new Date(y, m - 1, d)
  const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }
  label.textContent = dateObj.toLocaleDateString('ja-JP', options)

  const filtered = allTasks.filter(t => t.date === selectedDate)
  list.innerHTML = ''

  if (filtered.length === 0) {
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  filtered.forEach(task => {
    const li = document.createElement('li')
    li.className = `task-item${task.completed ? ' done' : ''}`

    li.innerHTML = `
      <div class="task-check" data-id="${task.id}">${task.completed ? '✓' : ''}</div>
      <span class="task-title">${task.title}</span>
    `

    li.querySelector('.task-check').addEventListener('click', async (e) => {
      e.stopPropagation()
      await toggleComplete(task.id, !task.completed)
    })

    li.addEventListener('click', () => openDetail(task))
    list.appendChild(li)
  })
}

// 完了トグル
async function toggleComplete(id, completed) {
  await db.from('tasks').update({ completed }).eq('id', id)
  await fetchTasks()
  renderTasks()
}

// 詳細ポップアップ
function openDetail(task) {
  document.getElementById('popup-detail-title').textContent = task.title
  document.getElementById('popup-detail-memo').textContent = task.memo || ''
  const urlEl = document.getElementById('popup-detail-url')
  urlEl.textContent = task.url || ''
  urlEl.href = task.url || ''

  document.getElementById('popup-detail-delete').onclick = async () => {
    await db.from('tasks').delete().eq('id', task.id)
    closePopup('popup-detail-overlay')
    await fetchTasks()
    renderCalendar()
    renderTasks()
  }

  document.getElementById('popup-detail-edit').onclick = () => {
    closePopup('popup-detail-overlay')
    openEdit(task)
  }

  openPopup('popup-detail-overlay')
}

// 編集ポップアップ
function openEdit(task) {
  document.getElementById('input-title').value = task.title
  document.getElementById('input-memo').value = task.memo || ''
  document.getElementById('input-url').value = task.url || ''

  document.getElementById('popup-save').onclick = async () => {
    const title = document.getElementById('input-title').value.trim()
    if (!title) return
    await db.from('tasks').update({
      title,
      memo: document.getElementById('input-memo').value,
      url: document.getElementById('input-url').value
    }).eq('id', task.id)
    closePopup('popup-add-overlay')
    await fetchTasks()
    renderCalendar()
    renderTasks()
  }

  openPopup('popup-add-overlay')
}

// タスク追加
function initAddPopup() {
  document.getElementById('btn-add').addEventListener('click', () => {
    document.getElementById('input-title').value = ''
    document.getElementById('input-memo').value = ''
    document.getElementById('input-url').value = ''

    document.getElementById('popup-save').onclick = async () => {
      const title = document.getElementById('input-title').value.trim()
      if (!title) return
      const { data: { session } } = await db.auth.getSession()
      await db.from('tasks').insert({
        title,
        memo: document.getElementById('input-memo').value,
        url: document.getElementById('input-url').value,
        date: selectedDate,
        user_id: session.user.id
      })
      closePopup('popup-add-overlay')
      await fetchTasks()
      renderCalendar()
      renderTasks()
    }

    openPopup('popup-add-overlay')
  })
}

// ポップアップ開閉
function openPopup(id) {
  document.getElementById(id).classList.add('open')
}
function closePopup(id) {
  document.getElementById(id).classList.remove('open')
}

// 年間カレンダー
function renderYearOverlay() {
  const grid = document.getElementById('year-grid')
  grid.innerHTML = ''
  const taskDates = new Set(allTasks.map(t => t.date))

  MONTHS_ES.forEach((name, mi) => {
    const block = document.createElement('div')
    block.className = 'year-month-block'

    const daysInMonth = new Date(currentYear, mi + 1, 0).getDate()
    const firstDay = new Date(currentYear, mi, 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1

    let html = `<div class="year-month-name">${name}</div><div class="year-mini-grid">`
    ;['L','M','M','J','V','S','D'].forEach(d => {
      html += `<div class="year-mini-dow">${d}</div>`
    })
    for (let i = 0; i < offset; i++) html += `<div></div>`
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(mi+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const isToday = dateStr === formatDate(today)
      const hasTask = taskDates.has(dateStr)
      html += `<div class="year-mini-day${isToday ? ' today' : ''}${hasTask ? ' has-task' : ''}" data-date="${dateStr}">${d}</div>`
    }
    html += '</div>'
    block.innerHTML = html

    block.querySelectorAll('.year-mini-day').forEach(el => {
      el.addEventListener('click', () => {
        const [y, m] = el.dataset.date.split('-')
        currentYear = parseInt(y)
        currentMonth = parseInt(m) - 1
        selectDate(el.dataset.date)
        closeYearOverlay()
      })
    })

    grid.appendChild(block)
  })
}

function closeYearOverlay() {
  document.getElementById('year-overlay').classList.remove('open')
}

// スクロールで月切り替え
let scrolling = false
document.addEventListener('DOMContentLoaded', () => {
  const calSection = document.querySelector('.calendar-section')
  calSection.addEventListener('wheel', (e) => {
    if (scrolling) return
    scrolling = true
    setTimeout(() => scrolling = false, 400)
    if (e.deltaY > 0) {
      currentMonth++
      if (currentMonth > 11) { currentMonth = 0; currentYear++ }
    } else {
      currentMonth--
      if (currentMonth < 0) { currentMonth = 11; currentYear-- }
    }
    renderCalendar()
  }, { passive: true })
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

// ログアウト
document.getElementById('logout-btn').addEventListener('click', async () => {
  await db.auth.signOut()
  window.location.href = '../login/login.html'
})

// HOYボタン
document.getElementById('btn-hoy').addEventListener('click', () => {
  currentYear = today.getFullYear()
  currentMonth = today.getMonth()
  selectDate(formatDate(today))
})

// 年間ボタン
document.getElementById('btn-year').addEventListener('click', () => {
  renderYearOverlay()
  document.getElementById('year-overlay').classList.add('open')
})
document.getElementById('year-close').addEventListener('click', closeYearOverlay)

// ポップアップを閉じる
document.getElementById('popup-add-close').addEventListener('click', () => closePopup('popup-add-overlay'))
document.getElementById('popup-detail-close').addEventListener('click', () => closePopup('popup-detail-overlay'))

// 起動
;(async () => {
  await checkAuth()
  await fetchTasks()
  renderCalendar()
  selectDate(selectedDate)
  initAddPopup()
})()

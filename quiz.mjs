import { questions } from "./quiz-data.mjs";
import { SCRIPT_URL } from "./config.mjs";

const root = document.getElementById('inkmate-quiz');
const form = root.querySelector('.answer-dock form');
const pinForm = root.querySelector('.pin');
const label = form.querySelector('label');
const input = root.querySelector('.answer-dock input');
const list = root.querySelector('[role="listbox"]');
const next = form.querySelector('button[type="submit"]');
const question = root.querySelector('h1');
const count = root.querySelector('.counter');
const progress = root.querySelector('progress');
const feedback = root.querySelector('.feedback');
const check = root.querySelector('.check');
const description = root.querySelector('.done-copy');
const results = root.querySelector('.results');
const pageAction = root.querySelector('.page-action');
const signOut = root.querySelector('.sign-out');
const pageError = root.querySelector('.page-error');
const dialog = root.querySelector('dialog');
progress.max = questions.length;
let roster = [];
let everyone = [];
let me = null;
let pin = '';
const answers = [];
let step = -1; // -1 = layar pilih nama sendiri
let selected = null;
let active = -1;
let sending = false;

function closeList() {
  list.hidden = true;
  active = -1;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function clearFeedback() {
  feedback.hidden = true;
  feedback.textContent = '';
}

function suggest() {
  closeList();
  list.replaceChildren();
  clearFeedback();
  const query = input.value.trim().toLowerCase();
  if (selected) return;
  const matches = roster.filter(person => [person.name, ...person.aliases].some(name => name.toLowerCase().startsWith(query)));
  for (const person of matches) {
    const option = document.createElement('li');
    option.id = `inkmate-quiz-option-${list.children.length}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.dataset.member = person.id;
    option.textContent = person.name;
    list.append(option);
  }
  list.hidden = !matches.length;
  input.setAttribute('aria-expanded', String(!list.hidden));
  if (list.hidden) {
    feedback.textContent = 'Nama belum ketemu.';
    feedback.hidden = false;
  }
}

function select(option) {
  selected = roster.find(person => person.id === option.dataset.member);
  input.value = selected.name;
  next.disabled = false;
  check.hidden = false;
  closeList();
}

input.addEventListener('input', () => {
  selected = null;
  next.disabled = true;
  check.hidden = true;
  suggest();
});
input.addEventListener('focus', suggest);
input.addEventListener('click', () => {
  if (list.hidden && !selected) suggest();
});
input.addEventListener('blur', closeList);
list.addEventListener('mousedown', event => event.preventDefault());
list.addEventListener('click', event => {
  const option = event.target.closest('[role="option"]');
  if (option && !list.hidden) select(option);
});
input.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeList();
  if (event.key === 'Enter' && !list.hidden && (active >= 0 || list.children.length === 1)) {
    event.preventDefault();
    select(list.children[Math.max(active, 0)]);
  }
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  if (list.hidden) suggest();
  if (list.hidden) return;
  event.preventDefault();
  const size = list.children.length;
  active = event.key === 'ArrowDown' ? (active + 1) % size : (active <= 0 ? size - 1 : active - 1);
  for (const [index, option] of Array.from(list.children).entries()) {
    option.setAttribute('aria-selected', String(index === active));
  }
  input.setAttribute('aria-activedescendant', list.children[active].id);
  list.children[active].scrollIntoView({ block: 'nearest' });
});

function showQuestion(focus) {
  const asking = step >= 0;
  const [start, emphasis] = asking ? questions[step] : ['Kamu ', 'siapa?'];
  const italic = document.createElement('em');
  italic.textContent = emphasis;
  question.replaceChildren(start, italic);
  progress.value = step + 1;
  progress.hidden = !asking;
  count.textContent = `Q${step + 1} / ${questions.length}`;
  count.hidden = !asking;
  signOut.hidden = !asking;
  label.textContent = asking ? 'Jawaban' : 'Nama kamu';
  input.placeholder = asking ? 'Ketik nama Inkteammate' : 'Ketik nama kamu';
  selected = null;
  input.value = '';
  check.hidden = true;
  next.disabled = true;
  next.textContent = !asking ? 'Mulai' : step === questions.length - 1 ? 'Kirim jawaban' : 'Lanjut';
  input.enterKeyHint = step === questions.length - 1 ? 'done' : 'next';
  closeList();
  clearFeedback();
  if (focus) {
    input.focus();
    if (list.hidden) suggest();
  }
}

const errors = {
  forbidden: 'PIN salah.',
  unavailable: 'Koneksi ke penyimpanan terganggu. Coba lagi.',
  invalid_answers: 'Daftar pilihan berubah. Muat ulang halaman.',
  closed: 'Pengisian sudah ditutup.',
  invalid_phase: 'Status periode sudah berubah. Muat ulang halaman.',
  insufficient: 'Jumlah pengisi belum cukup untuk publikasi.',
  busy: 'Lagi ada yang kirim juga. Coba lagi sebentar.'
};

// Mode demo: tidak ada yang disimpan. Roster asli dikirim Apps Script (apps-script/Inkwell.gs).
const demoRoster = [['Arlin'], ['Faustin'], ['Harry'], ['Juliett', 'Jul', 'Cijul', 'Julietta'], ['Lisa', 'Monalisa'],
  ['Rani', 'Maharani'], ['Ricky'], ['Sebas', 'Sebastian'], ['Siska'], ['Vicky', 'Josephine'], ['Zaidan']]
  .map(([name, ...aliases]) => ({ id: name.toLowerCase(), name, aliases, done: false }));
const demo = action => action === 'status' ? { phase: 'open', roster: demoRoster } : { submitted: true };

async function api(action, data = {}) {
  if (!SCRIPT_URL) return demo(action);
  let result;
  try {
    // Body teks polos supaya browser tidak mengirim preflight, yang tidak dilayani Apps Script.
    const response = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ ...data, action }),
      signal: AbortSignal.timeout(30000) });
    result = await response.json();
  } catch {
    throw new Error('unavailable');
  }
  if (result.ok) return result;
  throw new Error(errors[result.error] ? result.error : 'unavailable');
}

function showPage(title, detail = '') {
  form.hidden = true;
  signOut.hidden = true;
  pinForm.hidden = true;
  count.hidden = true;
  progress.hidden = true;
  pageAction.hidden = true;
  pageError.hidden = true;
  results.replaceChildren();
  results.hidden = true;
  question.textContent = title;
  description.textContent = detail;
  description.hidden = !detail;
}

function action(label, handler) {
  pageAction.textContent = label;
  pageAction.hidden = false;
  pageAction.onclick = handler;
}

function showError(code) {
  pageError.textContent = errors[code] || errors.unavailable;
  pageError.hidden = false;
}

function confirmAction(title, detail, label) {
  dialog.querySelector('h2').textContent = title;
  dialog.querySelector('.confirm-detail').textContent = detail;
  dialog.querySelector('.confirm-action').textContent = label;
  dialog.returnValue = 'cancel';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

function showResults(rows) {
  for (const [index, values] of rows) {
    const group = document.createElement('details');
    const title = document.createElement('summary');
    title.textContent = questions[index].join('');
    const list = document.createElement('ul');
    list.className = 'results-list';
    for (const value of values) {
      const item = document.createElement('li');
      item.textContent = value;
      list.append(item);
    }
    group.append(title, list);
    results.append(group);
  }
  results.hidden = !rows.length;
}

async function admin() {
  const state = await api('admin', { pin });
  const labels = { draft: 'Periode belum dibuka', open: 'Pengisian dibuka', closed: 'Pengisian ditutup', revealed: 'Apresiasi terbit' };
  showPage(labels[state.phase], `${state.complete} dari ${state.total} Inkteammates sudah isi.`);
  if (state.totals) showResults(state.totals.map((row, index) => [index, row.map(person => `${person.name} · ${person.count}`)]));
  const command = { draft: ['open', 'Buka pengisian'], open: ['close', 'Tutup pengisian'],
    closed: ['publish', 'Publikasikan apresiasi'] }[state.phase];
  if (!command) return;
  if (state.phase === 'closed' && state.complete < state.minimum) {
    description.textContent += ` Perlu ${state.minimum} jawaban untuk publikasi.`;
    return;
  }
  const [name, label] = command;
  action(label, async () => {
    let detail = 'Inkteammates akan melihat nama yang mendapat apresiasi.';
    if (name === 'close') {
      detail = state.complete < state.minimum ? `Saat ini ${state.complete} orang sudah isi. Kalau ditutup, apresiasi tidak bisa dipublikasikan karena perlu ${state.minimum} jawaban.` :
        'Inkteammates tidak bisa mengirim jawaban setelah periode ditutup.';
    }
    if (name !== 'open' && !await confirmAction(`${label}?`, detail, label)) return;
    pageAction.disabled = true;
    pageError.hidden = true;
    try {
      await api(name, { pin });
      await admin();
    } catch (error) {
      showError(error.message);
    } finally {
      pageAction.disabled = false;
    }
  });
}

const doneCopy = 'Apresiasi akan muncul di sini setelah dipublikasikan.';

async function start() {
  if (location.hash === '#admin') {
    showPage('Admin Inkwell', SCRIPT_URL ? '' : 'Penyimpanan belum disambungkan.');
    pinForm.hidden = !SCRIPT_URL;
    return;
  }
  try {
    const status = await api('status');
    if (status.phase === 'revealed') {
      showPage('Apresiasi tim');
      showResults(status.awards.map(award => [award.question - 1, award.winners]));
    } else if (status.phase === 'open') {
      everyone = status.roster;
      roster = everyone;
      showPage('Inkwell', SCRIPT_URL ? 'Jawaban disimpan sebagai total nominasi.' : 'Mode demo. Jawaban tidak disimpan.');
      form.hidden = false;
      showQuestion(false);
    } else {
      showPage(status.phase === 'closed' ? 'Pengisian selesai' : 'Kuis belum dibuka', 'Cek lagi nanti.');
    }
  } catch {
    showPage('Kuis belum bisa dibuka', errors.unavailable);
    action('Muat ulang', () => location.reload());
  }
}

window.addEventListener('hashchange', () => location.reload());

pinForm.addEventListener('submit', async event => {
  event.preventDefault();
  pin = pinForm.querySelector('input').value.trim();
  pageError.hidden = true;
  try {
    await admin();
  } catch (error) {
    showError(error.message);
  }
});

signOut.onclick = async () => {
  if ((step > 0 || selected) &&
      !await confirmAction('Ganti nama?', 'Jawaban yang belum dikirim akan hilang.', 'Ganti nama')) return;
  location.reload();
};

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!selected || input.value !== selected.name || sending) return;
  if (step < 0) {
    me = selected;
    if (me.done) {
      showPage('Jawaban sudah dikirim', doneCopy);
      return;
    }
    roster = everyone.filter(person => person.id !== me.id);
    description.hidden = true;
    step = 0;
    showQuestion(true);
    return;
  }
  answers[step] = selected.id;
  if (step < questions.length - 1) {
    step++;
    showQuestion(true);
    return;
  }
  sending = true;
  next.disabled = true;
  input.disabled = true;
  signOut.disabled = true;
  next.textContent = 'Mengirim…';
  pageError.hidden = true;
  try {
    await api('submit', { me: me.id, answers });
    answers.length = 0;
    showPage(SCRIPT_URL ? 'Jawaban sudah dikirim' : 'Demo selesai',
      SCRIPT_URL ? doneCopy : 'Tidak ada jawaban yang disimpan.');
  } catch (error) {
    showError(error.message);
  } finally {
    sending = false;
    input.disabled = false;
    signOut.disabled = false;
    next.disabled = false;
    next.textContent = 'Kirim jawaban';
  }
});

start();

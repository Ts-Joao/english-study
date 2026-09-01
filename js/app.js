/* =========================================================
   UTIL — randomização (Fisher–Yates)
   Uma única função de embaralhar, usada tanto para
   ordenar perguntas quanto alternativas.
   ========================================================= */
function shuffle(array){
  const copy = array.slice();
  for(let i = copy.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* =========================================================
   CARREGAMENTO DOS DADOS
   categories.json aponta para os arquivos de cada tópico.
   Isso permite adicionar um novo quiz só criando um .json
   e registrando ele em data/categories.json.
   ========================================================= */
const QUIZ_BANK = {}; // preenchido em runtime: { key: {title, eyebrow, description, questions} }

async function loadAllCategories(){
  const indexRes = await fetch('data/categories.json');
  if(!indexRes.ok) throw new Error('Não foi possível carregar data/categories.json');
  const index = await indexRes.json();

  await Promise.all(index.categories.map(async (entry) => {
    const res = await fetch(entry.file);
    if(!res.ok){
      console.error('Falha ao carregar', entry.file);
      return;
    }
    const data = await res.json();
    QUIZ_BANK[entry.key] = data;
  }));
}

/* categoria "mista" é gerada dinamicamente juntando todas as outras */
function buildMixedCategory(){
  const all = [];
  Object.values(QUIZ_BANK).forEach(cat => {
    cat.questions.forEach(q => all.push(q));
  });
  return {
    title: "Revisão geral",
    eyebrow: "Mixed review",
    description: "Uma mistura de todos os tópicos, em ordem aleatória.",
    questions: shuffle(all)
  };
}

/* =========================================================
   ESTADO
   ========================================================= */
const state = {
  categoryKey: null,   // chave original (para "melhor pontuação" e retry completo)
  quiz: null,           // { title, eyebrow, description, questions } — já randomizado para esta rodada
  index: 0,
  score: 0,
  answered: false,
  results: [],          // [{ questionRef, questionText, chosenText, correct }]
  isRetryOfWrong: false // se esta rodada é um "retry" só das erradas
};

const els = {};

function cacheEls(){
  els.home = document.getElementById('view-home');
  els.quiz = document.getElementById('view-quiz');
  els.results = document.getElementById('view-results');
  els.grid = document.getElementById('category-grid');
  els.qTag = document.getElementById('q-tag');
  els.qText = document.getElementById('q-text');
  els.options = document.getElementById('options');
  els.correctionSlot = document.getElementById('correction-slot');
  els.nextBtn = document.getElementById('next-btn');
  els.progressFill = document.getElementById('progress-fill');
  els.quizScore = document.getElementById('quiz-score');
  els.backBtn = document.getElementById('back-btn');
  els.gradeStamp = document.getElementById('grade-stamp');
  els.resultsSummary = document.getElementById('results-summary');
  els.resultsSubmeta = document.getElementById('results-submeta');
  els.reviewList = document.getElementById('review-list');
  els.retryBtn = document.getElementById('retry-btn');
  els.retryWrongBtn = document.getElementById('retry-wrong-btn');
  els.homeBtn = document.getElementById('home-btn');
}

/* =========================================================
   LOCALSTORAGE — melhor pontuação por categoria
   ========================================================= */
function getBestScore(key){
  const raw = localStorage.getItem('corrigido_best_' + key);
  return raw ? JSON.parse(raw) : null;
}
function setBestScore(key, score, total){
  const prev = getBestScore(key);
  if(!prev || score > prev.score){
    localStorage.setItem('corrigido_best_' + key, JSON.stringify({ score, total }));
  }
}

/* =========================================================
   HOME
   ========================================================= */
function renderHome(){
  els.grid.innerHTML = '';

  const entries = Object.entries(QUIZ_BANK);

  if(entries.length === 0){
    els.grid.innerHTML = '<p class="empty-state">Nenhum quiz encontrado. Verifique data/categories.json.</p>';
    return;
  }

  entries.forEach(([key, cat]) => {
    const best = getBestScore(key);
    const card = document.createElement('button');
    card.className = 'category-card';
    card.innerHTML = `
      <span class="eyebrow">${cat.eyebrow}</span>
      <h3>${cat.title}</h3>
      <p>${cat.description}</p>
      <div class="meta">
        <span>${cat.questions.length} perguntas</span>
        <span class="${best ? 'best' : ''}">${best ? `melhor: ${best.score}/${best.total}` : 'ainda não feito'}</span>
      </div>
    `;
    card.addEventListener('click', () => startQuiz(key));
    els.grid.appendChild(card);
  });

  const mixedCard = document.createElement('button');
  mixedCard.className = 'category-card mixed-card';
  const totalQ = entries.reduce((sum, [, c]) => sum + c.questions.length, 0);
  mixedCard.innerHTML = `
    <span class="eyebrow">Mixed review</span>
    <h3>Revisão geral</h3>
    <p>Todas as perguntas de todos os tópicos, embaralhadas.</p>
    <div class="meta">
      <span>${totalQ} perguntas</span>
      <span>aleatório</span>
    </div>
  `;
  mixedCard.addEventListener('click', () => startQuiz('__mixed__'));
  els.grid.appendChild(mixedCard);
}

/* =========================================================
   INICIAR QUIZ
   sourceQuestions: se informado, usa essa lista de perguntas
   diretamente (usado no "refazer só as erradas") em vez de
   pegar do banco original.
   ========================================================= */
function startQuiz(key, sourceQuestions){
  state.categoryKey = key;
  state.isRetryOfWrong = Boolean(sourceQuestions);

  let baseQuiz;
  if(sourceQuestions){
    // mantém metadados da categoria original quando possível
    const original = key === '__mixed__' ? { title: 'Revisão geral', eyebrow: 'Mixed review', description: '' } : QUIZ_BANK[key];
    baseQuiz = {
      title: original.title + ' — refazendo erros',
      eyebrow: original.eyebrow,
      description: 'Só as perguntas que você errou da última vez.',
      questions: sourceQuestions
    };
  } else if(key === '__mixed__'){
    baseQuiz = buildMixedCategory();
  } else {
    baseQuiz = QUIZ_BANK[key];
  }

  // randomiza a ORDEM das perguntas a cada tentativa (não altera o banco original)
  state.quiz = {
    ...baseQuiz,
    questions: shuffle(baseQuiz.questions)
  };
  state.index = 0;
  state.score = 0;
  state.results = [];

  els.home.classList.add('hidden');
  els.results.classList.remove('active');
  els.quiz.classList.add('active');

  renderQuestion();
}

/* =========================================================
   RENDERIZAR PERGUNTA — despacha por q.type
   Tipos suportados:
     - "multiple-choice" (padrão, usado quando q.type está ausente)
     - "drag-fill"   → arrastar/tocar uma palavra do banco até a lacuna
     - "word-order"  → tocar nas palavras na ordem certa para montar a frase
   ========================================================= */
function renderQuestion(){
  state.answered = false;
  const q = state.quiz.questions[state.index];
  const total = state.quiz.questions.length;

  els.qTag.textContent = `${q.tag || state.quiz.title} · Pergunta ${state.index + 1} de ${total}`;
  els.quizScore.textContent = `${state.score}/${total}`;
  els.progressFill.style.width = `${(state.index / total) * 100}%`;
  els.correctionSlot.innerHTML = '';
  els.nextBtn.classList.remove('show');
  els.nextBtn.textContent = (state.index + 1 < total) ? 'Próxima →' : 'Ver resultado →';
  els.options.innerHTML = '';

  const type = q.type || 'multiple-choice';
  if(type === 'drag-fill'){
    renderDragFill(q);
  } else if(type === 'word-order'){
    renderWordOrder(q);
  } else {
    els.qText.innerHTML = q.text;
    renderMultipleChoice(q);
  }
}

/* ---------- Tipo: multiple-choice (original) ---------- */
function renderMultipleChoice(q){
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  // randomiza a ORDEM das alternativas a cada exibição da pergunta
  const shuffledOptions = shuffle(q.options);

  shuffledOptions.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.innerHTML = `<span class="letter">${letters[i]}</span><span>${opt.text}</span>`;
    btn.addEventListener('click', () => selectOption(opt, btn, q));
    els.options.appendChild(btn);
  });
}

/* ---------- Tipo: drag-fill ----------
   Schema esperado (igual ao multiple-choice, só muda a interação):
   {
     "type": "drag-fill",
     "tag": "...",
     "text": "She <code>______</code> to the store yesterday.",
     "options": [ { "text": "went", "correct": true, "feedback": "..." }, ... ]
   }
   O aluno arrasta (ou toca) uma palavra do banco até a lacuna.
   ---------------------------------------------------------- */
function renderDragFill(q){
  // separa o texto no marcador da lacuna e insere uma dropzone real no lugar
  const parts = q.text.split('<code>______</code>');
  els.qText.innerHTML = `${parts[0] || ''}<span class="dropzone" id="dropzone"><span class="dropzone-placeholder">?</span></span>${parts[1] || ''}`;
  const dropzoneEl = document.getElementById('dropzone');

  dropzoneEl.addEventListener('dragover', (e) => {
    if(!state.answered) e.preventDefault();
  });
  dropzoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    if(state.answered) return;
    const idx = Number(e.dataTransfer.getData('text/plain'));
    const chip = bank.children[idx];
    if(chip) resolveDragFill(shuffledOptions[idx], chip, dropzoneEl, q);
  });

  const bank = document.createElement('div');
  bank.className = 'word-bank';

  const shuffledOptions = shuffle(q.options);
  shuffledOptions.forEach((opt, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'word-chip';
    chip.draggable = true;
    chip.textContent = opt.text;

    chip.addEventListener('dragstart', (e) => {
      if(state.answered){ e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', String(i));
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    // fallback por toque/clique — funciona em qualquer dispositivo, sem depender de drag nativo
    chip.addEventListener('click', () => {
      if(state.answered) return;
      resolveDragFill(opt, chip, dropzoneEl, q);
    });

    bank.appendChild(chip);
  });

  els.options.appendChild(bank);
  const hint = document.createElement('p');
  hint.className = 'interaction-hint';
  hint.textContent = 'Arraste a palavra certa até a lacuna (ou toque nela).';
  els.options.appendChild(hint);
}

function resolveDragFill(opt, chip, dropzoneEl, q){
  state.answered = true;

  dropzoneEl.textContent = opt.text;
  dropzoneEl.classList.add(opt.correct ? 'correct' : 'wrong');

  Array.from(els.options.querySelectorAll('.word-chip')).forEach((c) => {
    c.disabled = true;
    c.draggable = false;
    if(c === chip) c.classList.add(opt.correct ? 'correct' : 'wrong');
    else c.classList.add('dim');
  });

  if(opt.correct) state.score++;
  showCorrection(opt.feedback, opt.correct);

  state.results.push({
    questionRef: q,
    questionText: q.text.replace(/<[^>]+>/g, ''),
    chosen: opt.text,
    correct: opt.correct
  });

  els.quizScore.textContent = `${state.score}/${state.quiz.questions.length}`;
  els.nextBtn.classList.add('show');
}

/* ---------- Tipo: word-order ----------
   Schema esperado:
   {
     "type": "word-order",
     "tag": "...",
     "text": "Monte a frase: 'ela mora aqui há anos'",
     "words": ["She", "has", "lived", "here", "for", "years"],
     "feedback_correct": "...",
     "feedback_incorrect": "..."
   }
   "words" já vem na ORDEM CORRETA — o app embaralha a exibição.
   O aluno toca nas palavras, na ordem que julgar certa, para
   montá-las na faixa de resposta; pode tocar de novo para remover.
   ---------------------------------------------------------- */
function renderWordOrder(q){
  els.qText.innerHTML = q.text;

  const answerStrip = document.createElement('div');
  answerStrip.className = 'order-answer-strip';

  const wordBank = document.createElement('div');
  wordBank.className = 'word-bank';

  const shuffledWords = shuffle(q.words.map((w, i) => ({ text: w, id: i })));
  const chosen = []; // ids na ordem escolhida pelo aluno

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'next-btn show order-check-btn';
  checkBtn.textContent = 'Verificar';
  checkBtn.disabled = true;

  function renderBank(){
    wordBank.innerHTML = '';
    shuffledWords.forEach((w) => {
      if(chosen.includes(w.id)) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'word-chip';
      chip.textContent = w.text;
      chip.addEventListener('click', () => {
        if(state.answered) return;
        chosen.push(w.id);
        renderBank();
        renderStrip();
      });
      wordBank.appendChild(chip);
    });
  }

  function renderStrip(){
    answerStrip.innerHTML = '';
    if(chosen.length === 0){
      const placeholder = document.createElement('span');
      placeholder.className = 'strip-placeholder';
      placeholder.textContent = 'Toque nas palavras abaixo, na ordem certa';
      answerStrip.appendChild(placeholder);
    }
    chosen.forEach((id, pos) => {
      const w = shuffledWords.find((sw) => sw.id === id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'word-chip placed';
      chip.textContent = w.text;
      chip.addEventListener('click', () => {
        if(state.answered) return;
        chosen.splice(pos, 1);
        renderBank();
        renderStrip();
      });
      answerStrip.appendChild(chip);
    });
    checkBtn.disabled = chosen.length !== q.words.length;
  }

  checkBtn.addEventListener('click', () => {
    if(state.answered || chosen.length !== q.words.length) return;
    state.answered = true;

    const chosenWords = chosen.map((id) => shuffledWords.find((sw) => sw.id === id).text);
    const isCorrect = chosenWords.join(' ') === q.words.join(' ');

    Array.from(answerStrip.children).forEach((chip, i) => {
      chip.disabled = true;
      chip.classList.add(chosenWords[i] === q.words[i] ? 'correct' : 'wrong');
    });
    Array.from(wordBank.children).forEach((c) => (c.disabled = true));

    if(isCorrect) state.score++;
    const feedback = isCorrect
      ? (q.feedback_correct || 'Isso! A ordem está correta.')
      : (q.feedback_incorrect || `A ordem correta é: "${q.words.join(' ')}"`);
    showCorrection(feedback, isCorrect);

    state.results.push({
      questionRef: q,
      questionText: q.text.replace(/<[^>]+>/g, ''),
      chosen: chosenWords.join(' '),
      correct: isCorrect
    });

    els.quizScore.textContent = `${state.score}/${state.quiz.questions.length}`;
    els.nextBtn.classList.add('show');
  });

  els.options.appendChild(answerStrip);
  els.options.appendChild(wordBank);
  els.options.appendChild(checkBtn);
  renderBank();
  renderStrip();
}

/* =========================================================
   SELECIONAR ALTERNATIVA
   ========================================================= */
function selectOption(opt, btn, q){
  if(state.answered) return;
  state.answered = true;

  const allBtns = Array.from(els.options.children);
  allBtns.forEach(b => b.disabled = true);

  if(opt.correct){
    btn.classList.add('correct');
    state.score++;
    showCorrection(opt.feedback, true);
  } else {
    btn.classList.add('wrong');
    const correctOpt = q.options.find(o => o.correct);
    allBtns.forEach(b => {
      if(b.textContent.trim() === correctOpt.text) b.classList.add('correct');
      if(b !== btn) b.classList.add('dim');
    });
    showCorrection(opt.feedback, false);
  }

  state.results.push({
    questionRef: q,
    questionText: q.text.replace(/<[^>]+>/g, ''),
    chosen: opt.text,
    correct: opt.correct
  });

  els.quizScore.textContent = `${state.score}/${state.quiz.questions.length}`;
  els.nextBtn.classList.add('show');
}

function showCorrection(text, isCorrect){
  const div = document.createElement('div');
  div.className = 'correction' + (isCorrect ? ' ok-note' : '');
  div.textContent = text;
  els.correctionSlot.appendChild(div);
}

/* =========================================================
   NAVEGAÇÃO
   ========================================================= */
function bindStaticEvents(){
  els.nextBtn.addEventListener('click', () => {
    const total = state.quiz.questions.length;
    if(state.index + 1 < total){
      state.index++;
      renderQuestion();
    } else {
      els.progressFill.style.width = '100%';
      finishQuiz();
    }
  });

  els.retryBtn.addEventListener('click', () => {
    // refaz o quiz inteiro (perguntas originais da categoria, nova ordem aleatória)
    startQuiz(state.categoryKey);
  });

  els.retryWrongBtn.addEventListener('click', () => {
    const wrongQuestions = state.results
      .filter(r => !r.correct)
      .map(r => r.questionRef);
    if(wrongQuestions.length === 0) return;
    startQuiz(state.categoryKey, wrongQuestions);
  });

  els.homeBtn.addEventListener('click', backToHome);
  els.backBtn.addEventListener('click', backToHome);

  document.addEventListener('keydown', (e) => {
    if(!els.quiz.classList.contains('active') || state.answered) return;
    const currentQ = state.quiz.questions[state.index];
    const isMultipleChoice = !currentQ || !currentQ.type || currentQ.type === 'multiple-choice';
    if(isMultipleChoice){
      const n = parseInt(e.key, 10);
      if(n >= 1 && n <= els.options.children.length){
        els.options.children[n - 1].click();
      }
    }
    if(e.key === 'Enter' && els.nextBtn.classList.contains('show')){
      els.nextBtn.click();
    }
  });
}

function backToHome(){
  els.quiz.classList.remove('active');
  els.results.classList.remove('active');
  els.home.classList.remove('hidden');
  renderHome();
}

/* =========================================================
   RESULTADOS
   ========================================================= */
function finishQuiz(){
  els.quiz.classList.remove('active');
  els.results.classList.add('active');

  const total = state.quiz.questions.length;
  const pct = state.score / total;

  // só grava "melhor pontuação" quando é a categoria completa, não um retry de erradas
  if(!state.isRetryOfWrong && state.categoryKey){
    setBestScore(state.categoryKey, state.score, total);
  }

  let grade = 'F';
  if(pct === 1) grade = 'A+';
  else if(pct >= 0.85) grade = 'A';
  else if(pct >= 0.7) grade = 'B';
  else if(pct >= 0.5) grade = 'C';
  else if(pct >= 0.3) grade = 'D';

  els.gradeStamp.textContent = grade;
  els.resultsSummary.textContent = `Você acertou ${state.score} de ${total} — ${Math.round(pct * 100)}%`;

  const wrongCount = state.results.filter(r => !r.correct).length;
  els.resultsSubmeta.textContent = state.isRetryOfWrong
    ? 'esta era uma rodada de revisão só com as perguntas erradas'
    : (wrongCount > 0 ? `${wrongCount} pergunta(s) para revisar` : 'gabarito perfeito — nada para revisar!');

  els.retryWrongBtn.disabled = wrongCount === 0;
  els.retryWrongBtn.textContent = wrongCount > 0
    ? `Refazer só as erradas (${wrongCount})`
    : 'Nenhum erro para refazer';

  els.reviewList.innerHTML = '';
  state.results.forEach(r => {
    const item = document.createElement('div');
    item.className = 'review-item ' + (r.correct ? 'hit' : 'miss');
    item.innerHTML = `
      <div class="rq">${r.questionText}</div>
      <div class="ra">Sua resposta: ${r.chosen} ${r.correct ? '✓' : '✗'}</div>
    `;
    els.reviewList.appendChild(item);
  });
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */
async function init(){
  cacheEls();
  bindStaticEvents();

  els.grid.innerHTML = '<p class="loading-note">Carregando quizzes…</p>';
  try{
    await loadAllCategories();
    renderHome();
  } catch(err){
    console.error(err);
    els.grid.innerHTML = `
      <p class="empty-state">
        Não foi possível carregar os arquivos JSON (${err.message}).<br>
        Isso costuma acontecer ao abrir o index.html direto com duplo-clique.
        Rode um servidor local na pasta do projeto, por exemplo:<br>
        <code>python3 -m http.server</code> e acesse http://localhost:8000
      </p>`;
  }
}

document.addEventListener('DOMContentLoaded', init);

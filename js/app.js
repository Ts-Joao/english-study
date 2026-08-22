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
   RENDERIZAR PERGUNTA
   ========================================================= */
function renderQuestion(){
  state.answered = false;
  const q = state.quiz.questions[state.index];
  const total = state.quiz.questions.length;

  els.qTag.textContent = `${q.tag || state.quiz.title} · Pergunta ${state.index + 1} de ${total}`;
  els.qText.innerHTML = q.text;
  els.quizScore.textContent = `${state.score}/${total}`;
  els.progressFill.style.width = `${(state.index / total) * 100}%`;
  els.correctionSlot.innerHTML = '';
  els.nextBtn.classList.remove('show');
  els.nextBtn.textContent = (state.index + 1 < total) ? 'Próxima →' : 'Ver resultado →';

  els.options.innerHTML = '';
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
    const n = parseInt(e.key, 10);
    if(n >= 1 && n <= els.options.children.length){
      els.options.children[n - 1].click();
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

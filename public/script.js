// ---- Auth state ----
let authToken = localStorage.getItem('reader_token') || null;
let authEmail = localStorage.getItem('reader_email') || null;
let isSignupMode = false;

const authSection = document.getElementById('auth-section');
const appMain = document.getElementById('app-main');
const userBar = document.getElementById('user-bar');
const userEmailEl = document.getElementById('user-email');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authErrorMsg = document.getElementById('auth-error-msg');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');
const authPasswordHint = document.getElementById('auth-password-hint');
const logoutBtn = document.getElementById('logout-btn');
const historyBtn = document.getElementById('history-btn');
const historyBackBtn = document.getElementById('history-back-btn');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');

function showApp() {
  authSection.closest('main').classList.add('hidden');
  appMain.classList.remove('hidden');
  userBar.classList.remove('hidden');
  userEmailEl.textContent = authEmail || '';
}

function showAuth() {
  authSection.closest('main').classList.remove('hidden');
  appMain.classList.add('hidden');
  userBar.classList.add('hidden');
}

if (authToken) {
  showApp();
} else {
  showAuth();
}

authToggleBtn.addEventListener('click', () => {
  isSignupMode = !isSignupMode;
  authErrorMsg.textContent = '';
  if (isSignupMode) {
    authTitle.textContent = 'Create an account';
    authSubmitBtn.textContent = 'Sign up';
    authToggleText.textContent = 'Already have an account?';
    authToggleBtn.textContent = 'Sign in';
    authPasswordHint.classList.remove('hidden');
  } else {
    authTitle.textContent = 'Sign in';
    authSubmitBtn.textContent = 'Sign in';
    authToggleText.textContent = "Don't have an account?";
    authToggleBtn.textContent = 'Create one';
    authPasswordHint.classList.add('hidden');
  }
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authErrorMsg.textContent = '';

  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const endpoint = isSignupMode ? '/api/auth/signup' : '/api/auth/login';

  authSubmitBtn.disabled = true;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      authErrorMsg.textContent = data.error || 'Something went wrong.';
      return;
    }

    authToken = data.token;
    authEmail = data.email;
    localStorage.setItem('reader_token', authToken);
    localStorage.setItem('reader_email', authEmail);
    showApp();
  } catch (err) {
    console.error(err);
    authErrorMsg.textContent = 'Could not reach the server. Is it running?';
  } finally {
    authSubmitBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', () => {
  authToken = null;
  authEmail = null;
  localStorage.removeItem('reader_token');
  localStorage.removeItem('reader_email');
  showAuth();
});

historyBtn.addEventListener('click', async () => {
  document.getElementById('form-section').classList.add('hidden');
  document.getElementById('results-section').classList.add('hidden');
  historySection.classList.remove('hidden');

  try {
    const res = await fetch('/api/history', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (res.status === 401) {
      logoutBtn.click();
      return;
    }

    historyList.innerHTML = '';
    if (!data.history || data.history.length === 0) {
      historyEmpty.classList.remove('hidden');
    } else {
      historyEmpty.classList.add('hidden');
      data.history.forEach(item => {
        const el = document.createElement('div');
        el.className = 'history-item';
        const date = new Date(item.createdAt + 'Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        el.innerHTML = `
          <span class="history-score">${item.overallScore}</span>
          <div class="history-main">
            <p class="history-date"></p>
            <p class="history-summary"></p>
          </div>
        `;
        el.querySelector('.history-date').textContent = date;
        el.querySelector('.history-summary').textContent = item.result.overallVerdict || '';
        historyList.appendChild(el);
      });
    }
  } catch (err) {
    console.error(err);
  }
});

historyBackBtn.addEventListener('click', () => {
  historySection.classList.add('hidden');
  document.getElementById('form-section').classList.remove('hidden');
});

// ---- Prediction form ----
const form = document.getElementById('predict-form');
const activityList = document.getElementById('activity-list');
const addActivityBtn = document.getElementById('add-activity');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const formSection = document.getElementById('form-section');
const resultsSection = document.getElementById('results-section');
const resetBtn = document.getElementById('reset-btn');

function activityRowTemplate() {
  const row = document.createElement('div');
  row.className = 'activity-row';
  row.innerHTML = `
    <input type="text" class="activity-input" placeholder="e.g. Research intern, university biology lab">
    <button type="button" class="remove-activity" aria-label="Remove">×</button>
  `;
  row.querySelector('.remove-activity').addEventListener('click', () => {
    if (activityList.children.length > 1) row.remove();
  });
  return row;
}

addActivityBtn.addEventListener('click', () => {
  activityList.appendChild(activityRowTemplate());
});

activityList.querySelectorAll('.remove-activity').forEach(btn => {
  btn.addEventListener('click', () => {
    if (activityList.children.length > 1) btn.closest('.activity-row').remove();
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';

  const gpa = document.getElementById('gpa').value.trim();
  const gpaScale = document.getElementById('gpaScale').value;
  const testScore = document.getElementById('testScore').value.trim();
  const testType = document.getElementById('testType').value;
  const targetMajor = document.getElementById('targetMajor').value.trim();
  const notes = document.getElementById('notes').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();

  const activities = Array.from(document.querySelectorAll('.activity-input'))
    .map(i => i.value.trim())
    .filter(Boolean);

  if (!gpa || activities.length === 0) {
    errorMsg.textContent = 'Please add your GPA and at least one activity.';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Reading your file…';

  try {
    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gemini-Key': apiKey,
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ gpa, gpaScale, testScore, testType, activities, targetMajor, notes })
    });

    const data = await res.json();

    if (res.status === 401) {
      logoutBtn.click();
      errorMsg.textContent = 'Your session expired. Please sign in again.';
      return;
    }

    if (!res.ok) {
      errorMsg.textContent = data.error || 'Something went wrong. Please try again.';
      return;
    }

    renderResults(data);
    formSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    errorMsg.textContent = 'Could not reach the server. Is it running?';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Get my read';
  }
});

function renderResults(data) {
  document.getElementById('overall-score').textContent = data.overallScore;
  document.getElementById('overall-verdict').textContent = data.overallVerdict;

  document.getElementById('academic-score').textContent = `${data.academic.score} / 100`;
  document.getElementById('academic-feedback').textContent = data.academic.feedback;
  requestAnimationFrame(() => {
    document.getElementById('academic-bar').style.width = `${data.academic.score}%`;
  });

  const ecList = document.getElementById('ec-list');
  ecList.innerHTML = '';
  data.extracurriculars.forEach(ec => {
    const el = document.createElement('div');
    el.className = 'ec-item';
    el.innerHTML = `
      <div class="ec-main">
        <p class="ec-activity"></p>
        <p class="ec-feedback"></p>
      </div>
      <span class="ec-score">${ec.score}/100</span>
    `;
    el.querySelector('.ec-activity').textContent = ec.activity;
    el.querySelector('.ec-feedback').textContent = ec.feedback;
    ecList.appendChild(el);
  });

  const strengthsList = document.getElementById('strengths-list');
  strengthsList.innerHTML = '';
  data.strengths.forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    strengthsList.appendChild(li);
  });

  const improvementsList = document.getElementById('improvements-list');
  improvementsList.innerHTML = '';
  data.improvements.forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    improvementsList.appendChild(li);
  });

  const tiersList = document.getElementById('tiers-list');
  tiersList.innerHTML = '';
  data.schoolTiers.forEach(t => {
    const el = document.createElement('div');
    el.className = 'tier-row';
    el.innerHTML = `
      <span class="tier-name"></span>
      <span class="tier-examples"></span>
      <span class="tier-chance"></span>
    `;
    el.querySelector('.tier-name').textContent = t.tier;
    el.querySelector('.tier-examples').textContent = t.examples;
    el.querySelector('.tier-chance').textContent = `~${t.admitChancePercent}%`;
    tiersList.appendChild(el);
  });
}

resetBtn.addEventListener('click', () => {
  resultsSection.classList.add('hidden');
  formSection.classList.remove('hidden');
  formSection.scrollIntoView({ behavior: 'smooth' });
});
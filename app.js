/* ============================================================
   PLUME — Correcteur Français
   Application Logic (Vanilla JS, no dependencies)
   ============================================================ */

'use strict';

// ---- State --------------------------------------------------
const state = {
  mode: 'correct',     // 'correct' | 'rewrite'
  tone: 'standard',    // 'standard' | 'professional' | 'informal'
  isLoading: false,
  lastResult: null,
  lastResultPlain: '',
};

// ---- DOM refs -----------------------------------------------
const $ = (id) => document.getElementById(id);

const modeToggle         = $('modeToggle');
const inputText          = $('inputText');
const charCount          = $('charCount');
const actionBtn          = $('actionBtn');
const resultEmpty        = $('resultEmpty');
const resultLoading      = $('resultLoading');
const resultError        = $('resultError');
const resultContent      = $('resultContent');
const resultText         = $('resultText');
const resultFooter       = $('resultFooter');
const legend             = $('legend');
const errorMessage       = $('errorMessage');
const retryBtn           = $('retryBtn');
const copyBtn            = $('copyBtn');
const clearBtn           = $('clearBtn');
const tooltip            = $('tooltip');
const apiKeyModal        = $('apiKeyModal');
const apiKeyInput        = $('apiKeyInput');
const saveKeyBtn         = $('saveKeyBtn');
const cancelKeyBtn       = $('cancelKeyBtn');
const resetKeyBtn        = $('resetKeyBtn');
const resetKeyWidget     = $('resetKeyWidget');
const toneSelector       = $('toneSelector');
const tonePills          = document.querySelectorAll('.tone-pill');
const toggleKeyVis       = $('toggleKeyVisibility');
const actionBtnLabel     = actionBtn.querySelector('.btn-label');

// ---- Helpers ------------------------------------------------
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function toggle(el, visible) { el.classList.toggle('hidden', !visible); }

function setResultState(s) {
  // s: 'empty' | 'loading' | 'error' | 'content'
  toggle(resultEmpty,   s === 'empty');
  toggle(resultLoading, s === 'loading');
  toggle(resultError,   s === 'error');
  toggle(resultContent, s === 'content');
  toggle(resultFooter,  s === 'content');
}

function updateCharCount() {
  const n = inputText.value.length;
  charCount.textContent = n === 0 ? '0 caractère'
    : n === 1 ? '1 caractère'
    : `${n.toLocaleString('fr-FR')} caractères`;
}

// ---- Mode switch --------------------------------------------
function setMode(mode) {
  state.mode = mode;
  const isRewrite = mode === 'rewrite';

  modeToggle.setAttribute('aria-checked', isRewrite ? 'true' : 'false');
  document.body.classList.toggle('mode-rewrite', isRewrite);

  inputText.placeholder = isRewrite
    ? 'Écrivez le texte à reformuler…'
    : 'Écrivez ou collez votre texte à corriger…';

  actionBtnLabel.textContent = isRewrite ? 'Reformuler' : 'Corriger';
  actionBtn.setAttribute('aria-label', isRewrite ? 'Lancer la reformulation' : 'Lancer la correction');

  // Show/hide tone selector and reset key button
  toggle(toneSelector, isRewrite);
  toggle(resetKeyWidget, isRewrite);

  // Reset result
  setResultState('empty');
  state.lastResult = null;
  state.lastResultPlain = '';
}

modeToggle.addEventListener('click', () => {
  const next = state.mode === 'correct' ? 'rewrite' : 'correct';
  if (next === 'rewrite' && !getMistralKey()) {
    openApiKeyModal();
    return;
  }
  setMode(next);
});

modeToggle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    modeToggle.click();
  }
});

// ---- Tone selector ------------------------------------------
tonePills.forEach((pill) => {
  pill.addEventListener('click', () => {
    state.tone = pill.dataset.tone;
    tonePills.forEach((p) => {
      p.classList.toggle('active', p === pill);
      p.setAttribute('aria-pressed', p === pill ? 'true' : 'false');
    });
  });
});

// ---- Char counter -------------------------------------------
inputText.addEventListener('input', updateCharCount);

// ---- Keyboard shortcut --------------------------------------
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!apiKeyModal.classList.contains('hidden')) return;
    handleAction();
  }
  if (e.key === 'Escape' && !apiKeyModal.classList.contains('hidden')) {
    closeApiKeyModal(false);
  }
});

// ---- Main action --------------------------------------------
actionBtn.addEventListener('click', handleAction);
retryBtn.addEventListener('click', handleAction);

async function handleAction() {
  const text = inputText.value.trim();
  if (!text) {
    inputText.focus();
    shake(inputText);
    return;
  }
  if (state.isLoading) return;

  if (state.mode === 'correct') {
    await runCorrection(text);
  } else {
    const key = getMistralKey();
    if (!key) {
      openApiKeyModal();
      return;
    }
    await runRewrite(text, key);
  }
}

function shake(el) {
  el.parentElement.classList.add('shake');
  setTimeout(() => el.parentElement.classList.remove('shake'), 400);
}

// ---- LanguageTool correction --------------------------------
async function runCorrection(text) {
  state.isLoading = true;
  setResultState('loading');
  $('resultLoading').querySelector('.loading-text').textContent = 'Analyse en cours…';

  try {
    const body = new URLSearchParams({ text, language: 'fr' });
    const resp = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!resp.ok) throw new Error(`Erreur HTTP ${resp.status}`);

    const data = await resp.json();
    renderCorrections(text, data.matches || []);
  } catch (err) {
    showError('Impossible de contacter LanguageTool. Vérifiez votre connexion et réessayez.');
    console.error('[LT]', err);
  } finally {
    state.isLoading = false;
  }
}

function getErrorClass(match) {
  const rule = match.rule || {};
  const category = (rule.category?.id || '').toUpperCase();
  const id = (rule.id || '').toUpperCase();

  if (category === 'TYPOS' || id.includes('SPELL') || category === 'MISSPELLING') return 'highlight-typo';
  if (category === 'GRAMMAR' || id.includes('GRAMMAR')) return 'highlight-grammar';
  if (category === 'TYPOGRAPHY' || category === 'PUNCTUATION' || id.includes('PUNCT') || id.includes('TYPO')) return 'highlight-punct';
  return 'highlight-style';
}

function renderCorrections(text, matches) {
  if (matches.length === 0) {
    // No errors found
    state.lastResultPlain = text;
    resultText.innerHTML = '';
    const p = document.createElement('div');
    p.style.cssText = 'display:flex;align-items:center;gap:10px;color:rgba(34,197,94,0.9);font-size:15px;';
    p.innerHTML = '<span style="font-size:22px">✓</span> Aucune erreur détectée. Votre texte est impeccable !';
    resultText.appendChild(p);
    setResultState('content');
    hide(legend);
    state.lastResult = { type: 'correct', matches: [] };
    return;
  }

  // Build corrected text + highlighted HTML
  // We apply the first suggestion of each match to produce the corrected version.
  let html = '';
  let correctedPlain = '';
  let cursor = 0;
  const sorted = [...matches].sort((a, b) => a.offset - b.offset);

  for (const match of sorted) {
    const start = match.offset;
    const end   = match.offset + match.length;
    if (start < cursor) continue; // overlapping — skip

    const before     = text.slice(cursor, start);
    const original   = text.slice(start, end);
    const firstSugg  = match.replacements?.[0]?.value;
    const corrected  = firstSugg !== undefined ? firstSugg : original;
    const cssClass   = getErrorClass(match);
    // Tooltip shows original word and all suggestions
    const allSugg    = (match.replacements || []).slice(0, 3).map(r => r.value).join(', ') || '(aucune suggestion)';
    const message    = match.message || '';
    const dataOrig   = `data-original="${escapeAttr(original)}"`;
    const dataSugg   = `data-suggestion="${escapeAttr(allSugg)}"`;
    const dataMsg    = `data-message="${escapeAttr(message)}"`;

    html         += escapeHtml(before);
    correctedPlain += before;

    if (firstSugg !== undefined) {
      // Corrected word: highlighted to show it was changed
      html += `<span class="highlight ${cssClass}" ${dataOrig} ${dataSugg} ${dataMsg} tabindex="0">${escapeHtml(corrected)}</span>`;
      correctedPlain += corrected;
    } else {
      // No suggestion: keep original, still highlight as error
      html += `<span class="highlight ${cssClass}" ${dataOrig} ${dataSugg} ${dataMsg} tabindex="0">${escapeHtml(original)}</span>`;
      correctedPlain += original;
    }

    cursor = end;
  }

  // Append the remainder
  html           += escapeHtml(text.slice(cursor));
  correctedPlain += text.slice(cursor);

  state.lastResultPlain = correctedPlain;
  resultText.innerHTML = html;
  setResultState('content');
  show(legend);
  state.lastResult = { type: 'correct', matches };

  // Attach tooltip events
  resultText.querySelectorAll('.highlight').forEach(attachTooltip);
}

// ---- Mistral reformulation ----------------------------------
async function runRewrite(text, apiKey) {
  state.isLoading = true;
  setResultState('loading');
  $('resultLoading').querySelector('.loading-text').textContent = 'Reformulation en cours…';

  const toneInstructions = {
    standard:     `Reformule dans un registre neutre et naturel, fluide et agréable à lire, sans être ni trop formel ni trop familier.`,
    professional: `Reformule dans un registre professionnel et soutenu : vocabulaire précis et recherché, phrases bien structurées, ton formel adapté à un contexte d'entreprise ou académique.`,
    informal:     `Reformule dans un registre familier et décontracté : langage spontané, tournures naturelles à l'oral, contractions acceptées (t'as, c'est, y'a…), ton proche et chaleureux.`,
  };

  const systemPrompt = `Tu es un expert en langue française, maître de la rhétorique et de la stylistique. \
Tu reformules les textes en corrigeant toutes les fautes d'orthographe, de grammaire et de ponctuation. \
Tu améliores la fluidité, la clarté et la précision du vocabulaire. \
Consigne de ton OBLIGATOIRE : ${toneInstructions[state.tone]} \
Tu dois absolument respecter ce registre dans l'intégralité de ta reformulation. \
Tu réponds UNIQUEMENT avec le texte reformulé, sans explication, sans introduction, sans commentaire.`;

  try {
    const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (resp.status === 401) {
      clearMistralKey();
      showError('Clé API invalide ou expirée. Veuillez entrer une nouvelle clé.');
      setTimeout(() => openApiKeyModal(), 1200);
      return;
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.message || `Erreur HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const rewritten = data.choices?.[0]?.message?.content?.trim() || '';

    if (!rewritten) throw new Error('Réponse vide de Mistral.');

    state.lastResultPlain = rewritten;
    resultText.textContent = rewritten;
    setResultState('content');
    hide(legend);
    state.lastResult = { type: 'rewrite', text: rewritten };
  } catch (err) {
    showError(`Erreur Mistral : ${err.message}`);
    console.error('[Mistral]', err);
  } finally {
    state.isLoading = false;
  }
}

// ---- Error display ------------------------------------------
function showError(msg) {
  errorMessage.textContent = msg;
  setResultState('error');
  hide(resultFooter);
}

// ---- Copy & Clear -------------------------------------------
copyBtn.addEventListener('click', async () => {
  const text = state.lastResultPlain;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.classList.add('btn-copy-success');
    const span = copyBtn.querySelector('span');
    const original = span.textContent;
    span.textContent = 'Copié !';
    setTimeout(() => {
      copyBtn.classList.remove('btn-copy-success');
      span.textContent = original;
    }, 2000);
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
});

clearBtn.addEventListener('click', () => {
  inputText.value = '';
  updateCharCount();
  setResultState('empty');
  state.lastResult = null;
  state.lastResultPlain = '';
  inputText.focus();
});

// ---- Tooltip ------------------------------------------------
let tooltipTimeout;

function attachTooltip(el) {
  el.addEventListener('mouseenter', (e) => showTooltip(e, el));
  el.addEventListener('mousemove', (e) => positionTooltip(e));
  el.addEventListener('mouseleave', hideTooltip);
  el.addEventListener('focus', (e) => showTooltip(e, el));
  el.addEventListener('blur', hideTooltip);
}

function showTooltip(e, el) {
  clearTimeout(tooltipTimeout);
  const original   = el.dataset.original || '';
  const suggestion = el.dataset.suggestion || '';
  const message    = el.dataset.message || '';

  tooltip.innerHTML = `
    ${original ? `<div class="tooltip-label">Mot original</div><div style="text-decoration:line-through;opacity:0.6;margin-bottom:6px">${escapeHtml(original)}</div>` : ''}
    <div class="tooltip-label">Correction appliquée</div>
    <div class="tooltip-suggestion">${escapeHtml(suggestion)}</div>
    ${message ? `<div style="margin-top:6px;font-size:11px;opacity:0.55">${escapeHtml(message)}</div>` : ''}
  `;

  tooltip.setAttribute('aria-hidden', 'false');
  positionTooltip(e);

  tooltipTimeout = setTimeout(() => tooltip.classList.add('visible'), 60);
}

function positionTooltip(e) {
  const pad = 12;
  const tw  = tooltip.offsetWidth;
  const th  = tooltip.offsetHeight;
  let x = e.clientX + pad;
  let y = e.clientY - th - pad;

  if (x + tw > window.innerWidth - pad)  x = e.clientX - tw - pad;
  if (y < pad) y = e.clientY + pad;

  tooltip.style.left = `${x}px`;
  tooltip.style.top  = `${y}px`;
}

function hideTooltip() {
  clearTimeout(tooltipTimeout);
  tooltip.classList.remove('visible');
  tooltip.setAttribute('aria-hidden', 'true');
}

// ---- API Key management -------------------------------------
const STORAGE_KEY = 'mistral_api_key';

function getMistralKey() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

function saveMistralKey(key) {
  localStorage.setItem(STORAGE_KEY, key);
}

function clearMistralKey() {
  localStorage.removeItem(STORAGE_KEY);
}

const modalStateConnected = $('modalStateConnected');
const modalStateEnter     = $('modalStateEnter');
const keyPreviewText      = $('keyPreviewText');
const changeKeyBtn        = $('changeKeyBtn');
const connectedCloseBtn   = $('connectedCloseBtn');

function openApiKeyModal() {
  const existingKey = getMistralKey();
  if (existingKey) {
    // Show connected state
    keyPreviewText.textContent = maskKey(existingKey);
    show(modalStateConnected);
    hide(modalStateEnter);
    setTimeout(() => connectedCloseBtn.focus(), 100);
  } else {
    // Show enter-key state
    apiKeyInput.value = '';
    hide(modalStateConnected);
    show(modalStateEnter);
    setTimeout(() => apiKeyInput.focus(), 100);
  }
  clearModalKeyError();
  show(apiKeyModal);
  apiKeyModal.setAttribute('aria-hidden', 'false');
}

function openEnterKeyState() {
  hide(modalStateConnected);
  show(modalStateEnter);
  apiKeyInput.value = '';
  clearModalKeyError();
  setTimeout(() => apiKeyInput.focus(), 80);
}

function maskKey(key) {
  if (key.length <= 8) return '••••••••••••••••';
  return key.slice(0, 7) + '••••••••••••' + key.slice(-4);
}

function closeApiKeyModal(saved) {
  hide(apiKeyModal);
  apiKeyModal.setAttribute('aria-hidden', 'true');
  if (!saved && state.mode === 'rewrite' && !getMistralKey()) {
    // Cancelled without saving — revert to correct mode
    setMode('correct');
  }
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiKeyInput.focus();
    shake(apiKeyInput);
    return;
  }
  validateAndSaveKey(key);
});

async function validateAndSaveKey(key) {
  // Show loading state in the button
  saveKeyBtn.disabled = true;
  saveKeyBtn.textContent = 'Vérification…';
  clearModalKeyError();

  try {
    const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      }),
    });

    if (resp.status === 401) {
      showModalKeyError('Clé API invalide. Vérifiez et réessayez.');
      return;
    }
    if (!resp.ok && resp.status !== 200) {
      // Any other error (rate limit, server error…) — accept the key anyway
      // to not block the user on transient issues
    }

    // Key is valid
    saveMistralKey(key);
    closeApiKeyModal(true);
    setMode('rewrite');
  } catch {
    showModalKeyError('Impossible de contacter Mistral. Vérifiez votre connexion.');
  } finally {
    saveKeyBtn.disabled = false;
    saveKeyBtn.textContent = 'Enregistrer';
  }
}

function showModalKeyError(msg) {
  let el = document.getElementById('modalKeyError');
  if (!el) {
    el = document.createElement('p');
    el.id = 'modalKeyError';
    el.style.cssText = 'font-size:13px;color:#ef4444;text-align:center;margin-top:-6px;animation:fadeSlideIn .2s ease';
    saveKeyBtn.closest('.modal-actions').before(el);
  }
  el.textContent = msg;
  shake(apiKeyInput);
  apiKeyInput.focus();
}

function clearModalKeyError() {
  const el = document.getElementById('modalKeyError');
  if (el) el.remove();
}

cancelKeyBtn.addEventListener('click', () => closeApiKeyModal(false));

// Connected state: close button
connectedCloseBtn.addEventListener('click', () => closeApiKeyModal(true));

// Connected state: switch to enter-key state (change key)
changeKeyBtn.addEventListener('click', () => {
  clearMistralKey();
  openEnterKeyState();
});

// Bottom-right "Clé API" button — always opens the modal
resetKeyBtn.addEventListener('click', () => openApiKeyModal());

// Click outside modal closes it
apiKeyModal.addEventListener('click', (e) => {
  if (e.target === apiKeyModal) closeApiKeyModal(false);
});

// Enter in key input = save
apiKeyInput.addEventListener('input', clearModalKeyError);
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveKeyBtn.click();
});

// Toggle key visibility
toggleKeyVis.addEventListener('click', () => {
  const isPass = apiKeyInput.type === 'password';
  apiKeyInput.type = isPass ? 'text' : 'password';
  toggleKeyVis.setAttribute('aria-label', isPass ? 'Masquer la clé' : 'Afficher la clé');
});

// ---- HTML escaping ------------------------------------------
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- Shake animation ----------------------------------------
(function addShakeStyle() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%       { transform: translateX(-6px); }
      40%       { transform: translateX(6px); }
      60%       { transform: translateX(-4px); }
      80%       { transform: translateX(4px); }
    }
    .shake { animation: shake 0.35s ease; }
  `;
  document.head.appendChild(style);
})();

// ---- PWA Service Worker registration ------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}

// ---- Init ---------------------------------------------------
(function init() {
  updateCharCount();

  // Reset key widget is shown only in rewrite mode (managed by setMode)

  // Ensure correct initial state
  setResultState('empty');
})();

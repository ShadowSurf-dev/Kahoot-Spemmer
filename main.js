(function () {
  // ==== CONFIG ====
  const MAX_ATTEMPTS = 500000;
  const INTERVAL_MS = 50;
  const KEY_DELAY_MS = 12;
  const MIN_PIN = 100;
  const MAX_PIN = 999999;
  // =================

  // ==== State ====
  if (!window._autoSubmitState) window._autoSubmitState = {};
  const state = window._autoSubmitState;

  let stopped = false;
  let paused = true;
  let autoSubmitEnabled = false;
  let alertShown = false;

  // ==== Unique shuffled PINs ====
  if (!state.allPins) {
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    state.allPins = shuffle(Array.from({ length: MAX_PIN - MIN_PIN + 1 }, (_, i) => i + MIN_PIN));
    state.pinIndex = 0;
  }

  const allPins = state.allPins;

  // ==== Helpers ====
  function dispatchInput(el) {
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
  }

  function findGameInput() {
    return document.querySelector('input[name="gameId"]');
  }

  function findJoinBtn() {
    const candidates = ['Enter', 'Join', 'Play', 'Submit', 'Continue', 'OK'];
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
    for (const b of buttons) {
      const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
      if (!t) continue;
      for (const cand of candidates) if (new RegExp('\\b' + cand + '\\b', 'i').test(t)) return b;
    }
    return null;
  }

  async function setValueAndNotify(el, value) {
    if (!el) return;
    el.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(el, value);
    else el.value = value;
    dispatchInput(el);
    try { el.blur(); } catch (e) {}
    await new Promise(r => setTimeout(r, 20));
  }

  function submitIfAllowed(el) {
    if (!autoSubmitEnabled) return false;
    const btn = findJoinBtn();
    if (btn) { try { btn.click(); return true; } catch (e) {} }
    try {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      if (el.form && typeof el.form.submit === 'function') {
        el.form.submit();
        return true;
      }
    } catch (e) {}
    return false;
  }

  // ==== UI ====
  if (state.panel) state.panel.remove();

  const panel = document.createElement('div');
  state.panel = panel;
  Object.assign(panel.style, {
    position: 'fixed', left: '12px', bottom: '12px',
    zIndex: 2147483647, background: 'rgba(17,17,17,0.95)', color: '#fff',
    padding: '10px 12px', borderRadius: '8px', fontFamily: 'system-ui, sans-serif',
    fontSize: '13px', boxShadow: '0 6px 18px rgba(0,0,0,0.35)', width: '300px',
    cursor: 'move'
  });

  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px;">Auto-submit tester</div>
    <div id="__auto_submit_info" style="margin-top:4px;font-size:12px;">Ready · interval ${INTERVAL_MS}ms</div>
    <div id="__auto_submit_last" style="margin-top:4px;font-size:12px;">last: —</div>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button id="btn-submit" style="flex:1;padding:6px;border-radius:6px;border:none;cursor:pointer;font-weight:700;">ENABLE AUTO-SUBMIT</button>
      <button id="btn-pause" style="flex:1;padding:6px;border-radius:6px;border:none;cursor:pointer;font-weight:700;background:#f39c12;color:#fff;">PAUSED</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button id="btn-stop" style="flex:1;padding:6px;border-radius:6px;border:none;cursor:pointer;font-weight:700;background:#c0392b;color:#fff;">STOP</button>
      <button id="btn-reset" style="flex:1;padding:6px;border-radius:6px;border:none;cursor:pointer;font-weight:700;background:#2980b9;color:#fff;">RESET</button>
    </div>
  `;
  document.body.appendChild(panel);

  const info = panel.querySelector('#__auto_submit_info');
  const last = panel.querySelector('#__auto_submit_last');
  const btnSubmit = panel.querySelector('#btn-submit');
  const btnPause = panel.querySelector('#btn-pause');
  const btnStop = panel.querySelector('#btn-stop');
  const btnReset = panel.querySelector('#btn-reset');

  btnSubmit.onclick = () => {
    autoSubmitEnabled = true;
    btnSubmit.textContent = 'AUTO-SUBMIT: ENABLED';
    btnSubmit.disabled = true;
    btnSubmit.style.background = '#27ae60';
    btnSubmit.style.color = '#fff';
  };
  btnPause.onclick = () => {
    paused = !paused;
    btnPause.textContent = paused ? 'PAUSED' : 'RUNNING';
    btnPause.style.background = paused ? '#f39c12' : '#27ae60';
  };
  btnStop.onclick = () => {
    stopped = true;
    if (!alertShown) { alert("Stopped."); alertShown = true; }
    btnStop.disabled = true;
    btnStop.textContent = 'STOPPED';
  };
  btnReset.onclick = () => {
    stopped = true;
    // restart loop without removing panel or numbers
    alertShown = false;
    paused = true;
    btnPause.textContent = 'PAUSED';
    btnPause.style.background = '#f39c12';
    stopped = false;
    runLoop();
  };

  // draggable
  let offsetX=0, offsetY=0, dragging=false;
  panel.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    dragging=true; offsetX=e.clientX-panel.offsetLeft; offsetY=e.clientY-panel.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e=>{
    if(dragging){ panel.style.left=(e.clientX-offsetX)+'px'; panel.style.top=(e.clientY-offsetY)+'px'; panel.style.bottom=''; }
  });
  document.addEventListener('mouseup', ()=>dragging=false);

  // ==== Loop ====
  async function runLoop() {
    let attempts = 0;
    while (!stopped && attempts < MAX_ATTEMPTS && state.pinIndex < allPins.length) {
      if (paused) { await new Promise(r=>setTimeout(r,100)); continue; }
      attempts++;
      const pin = String(allPins[state.pinIndex++]);
      const el = findGameInput();
      if (!el) { if (!alertShown) { alert("gameId input not found"); alertShown = true; } break; }
      await setValueAndNotify(el, pin);
      const clicked = submitIfAllowed(el);
      if (info) info.textContent = `attempt ${attempts} · last ${pin} · submitted: ${clicked ? 'yes' : (autoSubmitEnabled ? 'no' : 'disabled')}`;
      if (last) last.textContent = `last: ${pin}`;
      await new Promise(r => setTimeout(r, INTERVAL_MS));
    }
    if (!stopped && !alertShown) { alert('Finished all PINs or attempts.'); alertShown = true; }
  }

  runLoop();
})();

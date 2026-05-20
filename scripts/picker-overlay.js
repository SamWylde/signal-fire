(() => {
  const PICKER_PORT = '__SF_PICKER_PORT__';
  const PANEL_ID = '__sf_picker_panel';
  const POPOVER_ID = '__sf_picker_popover';

  // Prevent double-injection on re-runs within same page lifetime
  if (document.getElementById(PANEL_ID)) return;

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  let pickerActive = true;
  let hoveredEl = null;
  let picks = [];
  let pendingEl = null;
  let pendingCandidates = [];

  // -------------------------------------------------------------------------
  // Selector generation
  // -------------------------------------------------------------------------

  function isStableId(id) {
    if (!id || id.length >= 30) return false;
    if (/[0-9]{5,}/.test(id)) return false;
    if (/^[a-f0-9\-]{20,}$/i.test(id)) return false;
    return true;
  }

  function escapeAttr(val) {
    return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function buildCandidates(el) {
    const candidates = [];
    const tag = el.tagName.toLowerCase();
    let testid;
    let e2e;
    let controlName;
    let ariaLabel;
    let role;
    let text;

    if (isStableId(el.id)) {
      candidates.push(`#${el.id}`);
    }

    testid = el.getAttribute('data-testid');
    if (testid) {
      candidates.push(`[data-testid='${escapeAttr(testid)}']`);
    }

    e2e = el.getAttribute('data-e2e');
    if (e2e) {
      candidates.push(`[data-e2e='${escapeAttr(e2e)}']`);
    }

    controlName = el.getAttribute('data-control-name');
    if (controlName) {
      candidates.push(`[data-control-name='${escapeAttr(controlName)}']`);
    }

    ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      candidates.push(`${tag}[aria-label='${escapeAttr(ariaLabel)}']`);
    }

    role = el.getAttribute('role');
    if (role) {
      candidates.push(`${tag}[role='${escapeAttr(role)}']`);
    }

    text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (text.length > 0 && text.length <= 30) {
      candidates.push(`${tag}:has-text('${escapeAttr(text)}')`);
    }

    if (candidates.length === 0) {
      candidates.push(buildChainSelector(el));
    }

    const seen = {};
    const deduped = [];
    let ci;
    for (ci = 0; ci < candidates.length; ci++) {
      if (!seen[candidates[ci]]) {
        seen[candidates[ci]] = true;
        deduped.push(candidates[ci]);
      }
    }

    return deduped.slice(0, 5);
  }

  const SEMANTIC_TAGS = [
    'nav',
    'main',
    'aside',
    'dialog',
    'header',
    'footer',
    'section',
    'article',
    'form',
  ];

  function buildChainSelector(el) {
    const parts = [];
    let current = el;
    let depth = 0;
    let part;
    let tid;
    let al;
    let cls;

    while (current && current !== document.body && depth < 5) {
      part = current.tagName.toLowerCase();

      if (isStableId(current.id)) {
        parts.unshift(`#${current.id}`);
        break;
      }

      tid = current.getAttribute('data-testid');
      if (tid) {
        parts.unshift(`[data-testid='${escapeAttr(tid)}']`);
        break;
      }

      al = current.getAttribute('aria-label');
      if (al) {
        part = `${part}[aria-label='${escapeAttr(al)}']`;
      } else if (SEMANTIC_TAGS.indexOf(part) !== -1) {
        // keep tag as-is
      } else {
        cls = Array.prototype.slice
          .call(current.classList || [])
          .filter((c) => c.length < 40 && !/[0-9]{4,}/.test(c))
          .slice(0, 2)
          .join('.');
        if (cls) part = `${part}.${cls}`;
      }

      parts.unshift(part);
      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }

  function getElementMetadata(el) {
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      aria: el.getAttribute('aria-label'),
      classNames: Array.prototype.slice.call(el.classList || []),
      boundingRect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Panel UI
  // -------------------------------------------------------------------------

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'position: fixed',
      'top: 12px',
      'right: 12px',
      'z-index: 2147483647',
      'background: #1a1a2e',
      'color: #e0e0e0',
      'font-family: monospace',
      'font-size: 12px',
      'width: 340px',
      'max-height: 80vh',
      'overflow-y: auto',
      'border-radius: 8px',
      'border: 1px solid #444',
      'box-shadow: 0 4px 20px rgba(0,0,0,0.6)',
      'padding: 12px',
      'user-select: none',
    ].join('; ');

    panel.innerHTML = [
      '<div style="font-weight:bold;font-size:13px;margin-bottom:6px;color:#ff9900;">',
      '  Signal-fire selector picker',
      '</div>',
      '<div id="__sf_status" style="font-size:11px;color:#aaa;margin-bottom:8px;">',
      '  Hover an element to highlight. Click to pick. Esc to cancel.',
      '</div>',
      '<div style="margin-bottom:8px;">',
      '  <label style="cursor:pointer;">',
      '    <input type="checkbox" id="__sf_toggle" checked style="margin-right:4px;">',
      '    Picker active',
      '  </label>',
      '</div>',
      '<div id="__sf_picks_list" style="margin-bottom:8px;"></div>',
      '<div style="display:flex;gap:6px;">',
      '  <button id="__sf_save_btn" style="',
      '    flex:1;padding:5px 8px;background:#0066cc;color:#fff;border:none;',
      '    border-radius:4px;cursor:pointer;font-size:11px;">',
      '    Save to file',
      '  </button>',
      '  <button id="__sf_clear_btn" style="',
      '    flex:1;padding:5px 8px;background:#cc3300;color:#fff;border:none;',
      '    border-radius:4px;cursor:pointer;font-size:11px;">',
      '    Clear all',
      '  </button>',
      '</div>',
      '<div id="__sf_toast" style="display:none;margin-top:6px;font-size:11px;color:#66ff99;"></div>',
    ].join('');

    document.body.appendChild(panel);

    document.getElementById('__sf_toggle').addEventListener('change', (e) => {
      pickerActive = e.target.checked;
      if (!pickerActive) clearHover();
    });

    document.getElementById('__sf_save_btn').addEventListener('click', () => {
      savePicks();
    });

    document.getElementById('__sf_clear_btn').addEventListener('click', () => {
      picks = [];
      renderPicksList();
    });
  }

  function renderPicksList() {
    const list = document.getElementById('__sf_picks_list');
    if (!list) return;
    if (picks.length === 0) {
      list.innerHTML = '<div style="color:#666;font-size:11px;">No picks yet.</div>';
      return;
    }
    let html = '';
    let i;
    let p;
    for (i = 0; i < picks.length; i++) {
      p = picks[i];
      html += '<div style="margin-bottom:4px;padding:4px;background:#16213e;border-radius:3px;">';
      html += `<span style="color:#ff9900;">${escapeHtml(p.intent)}</span>`;
      html += ` <span style="color:#aaa;word-break:break-all;">${escapeHtml(p.primarySelector)}</span>`;
      html += ` <button onclick="(function(i){window.__sfCopyPick(i)})(${i})" style="`;
      html +=
        'padding:1px 5px;background:#333;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:10px;">copy</button>';
      html += '</div>';
    }
    list.innerHTML = html;
  }

  window.__sfCopyPick = (i) => {
    const pick = picks[i];
    if (!pick) return;
    const text = JSON.stringify(pick, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const toast = document.getElementById('__sf_toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 4000);
  }

  // -------------------------------------------------------------------------
  // Save to file via local HTTP server
  // -------------------------------------------------------------------------

  function savePicks() {
    const payload = {
      url: window.location.href,
      accountId: window.__SF_ACCOUNT_ID__ || '',
      timestamp: new Date().toISOString(),
      picks: picks,
    };
    fetch(`http://127.0.0.1:${PICKER_PORT}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((data) => {
        showToast(`Saved to ${data.path}`);
      })
      .catch((err) => {
        showToast(`Save failed: ${String(err)}`);
      });
  }

  // -------------------------------------------------------------------------
  // Hover behavior
  // -------------------------------------------------------------------------

  function isPanelElement(el) {
    const panel = document.getElementById(PANEL_ID);
    const popover = document.getElementById(POPOVER_ID);
    return panel?.contains(el) || popover?.contains(el);
  }

  function clearHover() {
    if (hoveredEl) {
      hoveredEl.style.outline = '';
      hoveredEl.style.outlineOffset = '';
      hoveredEl = null;
    }
  }

  document.addEventListener(
    'mouseover',
    (e) => {
      if (!pickerActive) return;
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (isPanelElement(el)) return;

      clearHover();
      el.style.outline = '3px solid #ff6600';
      el.style.outlineOffset = '2px';
      hoveredEl = el;
    },
    true,
  );

  document.addEventListener(
    'mouseout',
    (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el === hoveredEl) {
        clearHover();
      }
    },
    true,
  );

  // -------------------------------------------------------------------------
  // Click behavior
  // -------------------------------------------------------------------------

  document.addEventListener(
    'click',
    (e) => {
      if (!pickerActive) return;
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (isPanelElement(el)) return;

      e.preventDefault();
      e.stopPropagation();

      clearHover();
      pendingEl = el;
      pendingCandidates = buildCandidates(el);
      showPopover(e.clientX, e.clientY, pendingCandidates, getElementMetadata(el));
    },
    true,
  );

  // -------------------------------------------------------------------------
  // Intent popover
  // -------------------------------------------------------------------------

  function showPopover(x, y, candidates, metadata) {
    const existing = document.getElementById(POPOVER_ID);
    if (existing) existing.remove();

    const popover = document.createElement('div');
    popover.id = POPOVER_ID;

    const left = Math.min(x + 8, window.innerWidth - 280);
    const top = Math.min(y + 8, window.innerHeight - 180);
    const primarySel = candidates[0] || '';

    popover.style.cssText = [
      'position: fixed',
      `left: ${left}px`,
      `top: ${top}px`,
      'z-index: 2147483647',
      'background: #1a1a2e',
      'color: #e0e0e0',
      'font-family: monospace',
      'font-size: 12px',
      'width: 260px',
      'border-radius: 6px',
      'border: 1px solid #ff6600',
      'box-shadow: 0 4px 16px rgba(0,0,0,0.7)',
      'padding: 10px',
    ].join('; ');

    popover.innerHTML = [
      '<div style="font-weight:bold;margin-bottom:6px;color:#ff9900;">Pick this element?</div>',
      `<div style="font-size:10px;color:#888;margin-bottom:4px;word-break:break-all;">${escapeHtml(primarySel)}</div>`,
      '<input id="__sf_intent_input" type="text" placeholder="Intent name (e.g. startPost)"',
      '  style="width:100%;box-sizing:border-box;background:#0d0d1a;color:#fff;border:1px solid #444;',
      '  border-radius:3px;padding:4px 6px;font-family:monospace;font-size:12px;margin-bottom:6px;">',
      '<div style="display:flex;gap:6px;">',
      '  <button id="__sf_popover_save" style="',
      '    flex:1;padding:4px 8px;background:#0066cc;color:#fff;border:none;',
      '    border-radius:3px;cursor:pointer;font-size:11px;">',
      '    Save',
      '  </button>',
      '  <button id="__sf_popover_cancel" style="',
      '    flex:1;padding:4px 8px;background:#444;color:#fff;border:none;',
      '    border-radius:3px;cursor:pointer;font-size:11px;">',
      '    Cancel',
      '  </button>',
      '</div>',
    ].join('');

    document.body.appendChild(popover);

    const input = document.getElementById('__sf_intent_input');
    if (input) input.focus();

    document.getElementById('__sf_popover_save').addEventListener('click', () => {
      commitPick(candidates, metadata);
    });

    document.getElementById('__sf_popover_cancel').addEventListener('click', () => {
      closePopover();
    });

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          commitPick(candidates, metadata);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closePopover();
        }
      });
    }
  }

  function closePopover() {
    const p = document.getElementById(POPOVER_ID);
    if (p) p.remove();
    pendingEl = null;
    pendingCandidates = [];
  }

  function commitPick(candidates, metadata) {
    const input = document.getElementById('__sf_intent_input');
    let intent = input ? input.value.trim() : '';
    if (!intent) {
      intent = `pick${picks.length + 1}`;
    }

    picks.push({
      intent: intent,
      primarySelector: candidates[0] || '',
      candidates: candidates,
      metadata: metadata,
    });

    renderPicksList();
    closePopover();
    showToast(`Added: ${intent}`);
  }

  // -------------------------------------------------------------------------
  // Escape key — cancel current selection
  // -------------------------------------------------------------------------

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        const popover = document.getElementById(POPOVER_ID);
        if (popover) {
          e.preventDefault();
          e.stopPropagation();
          closePopover();
        }
      }
    },
    true,
  );

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  function init() {
    buildPanel();
    renderPicksList();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();

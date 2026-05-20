export const REDESIGNED_APP_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signal Fire</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f4efe5;
      --surface: #fbf8f1;
      --surface-alt: #efe9dc;
      --surface-hi: #ffffff;
      --ink: #1b1f1c;
      --ink-2: #4e544f;
      --ink-3: #8a8e87;
      --ink-4: #b6b5ac;
      --line: #e2dccc;
      --line-strong: #cfc8b5;
      --nav: #0f1715;
      --nav-2: #18231f;
      --nav-ink: #e8e3d6;
      --nav-muted: #9ca29a;
      --active: #243330;
      --ember: #b85c3a;
      --ember-soft: #f1ddcf;
      --moss: #3c6b53;
      --moss-soft: #dce9de;
      --amber: #b07a1f;
      --amber-soft: #f4e6c2;
      --rust: #a23b2f;
      --rust-soft: #f1d5cf;
      --sky: #3c6688;
      --shadow: 0 18px 50px -26px rgba(15, 23, 21, 0.55);
      --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --mono: "Cascadia Mono", "SFMono-Regular", Consolas, ui-monospace, monospace;
      --serif: Georgia, "Times New Roman", serif;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--sans);
      font-size: 13px;
      letter-spacing: 0;
      overflow: hidden;
    }
    button, input, select, textarea { font: inherit; letter-spacing: 0; }
    button { cursor: pointer; }
    .app {
      height: 100vh;
      display: grid;
      grid-template-columns: 188px minmax(0, 1fr);
      background: var(--paper);
    }
    .sidebar {
      background: var(--nav);
      color: var(--nav-ink);
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 10px 12px;
      min-width: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 4px 14px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      margin-bottom: 6px;
    }
    .mark {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: #102019;
      font-weight: 800;
      font-size: 11px;
      background: linear-gradient(145deg, #7ee5c5, #f0b457 72%, #b85c3a);
      flex-shrink: 0;
    }
    .brand-title { font-weight: 700; font-size: 14px; }
    .brand-sub { color: var(--nav-muted); font-size: 10.5px; margin-top: 2px; }
    .nav-button {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 36px;
      border: 0;
      border-radius: 7px;
      padding: 8px 10px;
      background: transparent;
      color: var(--nav-muted);
      text-align: left;
      font-size: 13px;
    }
    .nav-button.active {
      background: var(--active);
      color: var(--nav-ink);
      font-weight: 650;
    }
    .nav-dot {
      width: 18px;
      height: 18px;
      border-radius: 5px;
      display: grid;
      place-items: center;
      color: currentColor;
      border: 1px solid rgba(255,255,255,.12);
      font-size: 10px;
      flex-shrink: 0;
    }
    .sidebar-spacer { flex: 1; }
    .account-chip {
      margin-top: 8px;
      padding: 8px 10px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .avatar {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: var(--ember);
      color: #fff;
      display: grid;
      place-items: center;
      font-weight: 750;
      font-size: 10px;
      flex-shrink: 0;
    }
    .chip-main { font-size: 12px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chip-sub { font-size: 10px; color: var(--nav-muted); }
    .main {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--paper);
    }
    .topbar {
      height: 58px;
      padding: 0 22px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      gap: 14px;
      flex-shrink: 0;
    }
    h1 {
      margin: 0;
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -.3px;
    }
    .top-meta { color: var(--ink-3); font-size: 12px; }
    .toolbar { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .btn {
      min-height: 34px;
      padding: 0 13px;
      border: 1px solid var(--line-strong);
      border-radius: 7px;
      background: var(--surface-hi);
      color: var(--ink);
      font-weight: 650;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      white-space: nowrap;
    }
    .btn.primary { background: var(--ember); border-color: var(--ember); color: #fff; }
    .btn.dark { background: var(--ink); border-color: var(--ink); color: #fff; }
    .btn.ghost { background: transparent; border-color: transparent; color: var(--ink-2); }
    .btn.danger { background: var(--rust-soft); border-color: #e5beb7; color: var(--rust); }
    .btn:disabled { opacity: .52; cursor: not-allowed; }
    .view {
      display: none;
      min-height: 0;
      flex: 1;
      overflow: hidden;
    }
    .view.active { display: flex; }
    .safety {
      margin: 12px 22px 0;
      padding: 7px 12px;
      background: var(--moss-soft);
      border: 1px solid var(--line);
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--ink-2);
      font-size: 11.5px;
      flex-shrink: 0;
      overflow-x: auto;
      white-space: nowrap;
    }
    .safety b { color: var(--moss); text-transform: uppercase; letter-spacing: .8px; font-size: 10px; }
    .rule { width: 1px; height: 12px; background: var(--line-strong); flex-shrink: 0; }
    .compose-body {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 250px minmax(360px, 1fr) 340px;
      gap: 16px;
      padding: 16px;
    }
    .pane {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: auto;
      padding-bottom: 2px;
    }
    .eyebrow {
      color: var(--ink-3);
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: .9px;
      text-transform: uppercase;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 10px;
      box-shadow: var(--shadow);
      min-width: 0;
    }
    .card.pad { padding: 14px; }
    .target-list { padding: 4px; display: flex; flex-direction: column; gap: 2px; }
    .target-row {
      display: grid;
      grid-template-columns: 20px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      padding: 10px 8px;
      border-radius: 8px;
    }
    .target-row-body {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      cursor: pointer;
    }
    .target-row.selected {
      background: #fff;
      box-shadow: 0 0 0 1px var(--line-strong), 0 1px 2px rgba(0,0,0,.04);
    }
    .target-row input { width: 18px; height: 18px; margin: 0; accent-color: var(--ink); }
    .platform-square {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 10px;
      font-weight: 800;
    }
    .target-name { display: flex; gap: 5px; align-items: center; font-size: 12.5px; font-weight: 650; }
    .target-sub { margin-top: 2px; color: var(--ink-3); font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status-dot { width: 6px; height: 6px; border-radius: 999px; display: inline-block; margin-right: 5px; }
    .ok-dot { background: var(--moss); }
    .warn-dot { background: var(--amber); }
    .bad-dot { background: var(--rust); }
    .none-dot { background: var(--ink-4); }
    .mini-chip {
      font-size: 9px;
      font-weight: 800;
      color: var(--ember);
      background: var(--ember-soft);
      padding: 1px 5px;
      border-radius: 3px;
      letter-spacing: .3px;
    }
    .ovr-badge {
      font-size: 9px;
      font-weight: 800;
      color: #888;
      background: var(--surface-alt);
      border: 1px solid var(--line-strong);
      padding: 1px 5px;
      border-radius: 3px;
      letter-spacing: .3px;
    }
    .override-preview {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface-alt);
      color: var(--ink-3);
      padding: 9px 10px;
      font-size: 13px;
      line-height: 1.35;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .caption-count {
      font-size: 11px;
      color: var(--ink-3);
      text-align: right;
    }
    .caption-count.over { color: #c0392b; }
    .caption-warn { font-size: 11px; color: #c0392b; margin-top: 2px; }
    .override-section { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 12px; display: grid; gap: 8px; }
    label {
      display: grid;
      gap: 6px;
      color: var(--ink-3);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .2px;
      text-transform: uppercase;
      min-width: 0;
    }
    input, select, textarea {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line-strong);
      border-radius: 7px;
      background: var(--surface-hi);
      color: var(--ink);
      padding: 9px 10px;
      outline: none;
      font-family: var(--sans);
      font-size: 13px;
      font-weight: 500;
      line-height: 1.35;
      letter-spacing: 0;
      text-transform: none;
    }
    input::placeholder, textarea::placeholder { color: var(--ink-2); opacity: .86; }
    input:focus, select:focus, textarea:focus {
      border-color: var(--ember);
      box-shadow: 0 0 0 3px rgba(184,92,58,.16);
    }
    textarea { min-height: 140px; resize: vertical; line-height: 1.48; }
    textarea.compact { min-height: 74px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    [hidden] { display: none !important; }
    .card-head {
      min-height: 42px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .caption-box { padding: 14px; display: grid; gap: 12px; }
    .platform-empty {
      min-height: 42px;
      display: flex;
      align-items: center;
      color: var(--ink-2);
      font-size: 12px;
      font-weight: 650;
    }
    .caption-tools {
      border-top: 1px solid var(--line);
      background: var(--surface-alt);
      padding: 8px 12px;
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .file-field {
      position: relative;
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px dashed var(--line-strong);
      border-radius: 8px;
      padding: 8px 10px;
      background: var(--surface-hi);
      color: var(--ink-2);
      overflow: hidden;
    }
    .file-field input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11.5px; }
    .preview-stack {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-right: 2px;
    }
    .preview-card {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .preview-top { padding: 12px; display: flex; gap: 10px; align-items: flex-start; }
    .preview-avatar {
      width: 36px;
      height: 36px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: 800;
      flex-shrink: 0;
    }
    .preview-text { padding: 0 12px 12px; white-space: pre-wrap; line-height: 1.45; color: var(--ink); }
    .media-preview {
      min-height: 132px;
      background: linear-gradient(135deg, #2b3d38, #6c8478);
      display: grid;
      align-items: end;
      color: #f4efe5;
      padding: 12px;
      font-family: var(--serif);
      font-size: 22px;
      font-style: italic;
    }
    .media-preview img { width: 100%; height: 150px; object-fit: cover; display: block; margin: -12px; }
    .meta-line {
      color: var(--ink-3);
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .bottom-bar {
      border-top: 1px solid var(--line);
      background: var(--surface);
      padding: 8px 22px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--ink-3);
      font-size: 11.5px;
      flex-shrink: 0;
      min-height: 38px;
    }
    .page-view {
      overflow: auto;
      padding: 18px 22px;
      display: none;
    }
    .page-view.active { display: block; }
    .page-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
    .metric { padding: 15px; display: grid; gap: 7px; }
    .metric strong { font-size: 26px; }
    .metric span { color: var(--ink-3); font-size: 10.5px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; }
    .wide-grid { display: grid; grid-template-columns: minmax(360px, .9fr) minmax(420px, 1.1fr); gap: 16px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td {
      text-align: left;
      padding: 11px 12px;
      border-bottom: 1px solid var(--line);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    th { color: var(--ink-3); font-size: 10.5px; text-transform: uppercase; letter-spacing: .7px; }
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 62px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      border: 1px solid var(--line);
      background: var(--surface-alt);
      color: var(--ink-2);
    }
    .pill.fresh, .pill.ok { color: var(--moss); background: var(--moss-soft); border-color: #bed8c3; }
    .pill.stale, .pill.warn { color: var(--amber); background: var(--amber-soft); border-color: #e8d191; }
    .pill.none { color: var(--ink-3); background: var(--surface-alt); }
    .pill.bad { color: var(--rust); background: var(--rust-soft); border-color: #e5beb7; }
    .login-grid { display: grid; grid-template-columns: minmax(300px, .9fr) minmax(420px, 1.1fr); gap: 16px; }
    .account-input {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.12);
      color: var(--nav-ink);
      min-height: 34px;
    }
    .log {
      min-height: 64px;
      max-height: 160px;
      overflow: auto;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface-alt);
      color: var(--ink-2);
      line-height: 1.45;
      white-space: pre-wrap;
      font-family: var(--mono);
      font-size: 11.5px;
    }
    .log.good { color: var(--moss); background: var(--moss-soft); }
    .log.bad { color: var(--rust); background: var(--rust-soft); }
    .settings-grid { display: grid; grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr); gap: 16px; }
    .check-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 38px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--ink);
      background: var(--surface-hi);
      text-transform: none;
      letter-spacing: 0;
      font-size: 12.5px;
      font-weight: 700;
    }
    .check-row input { width: 16px; min-height: 16px; margin: 0; accent-color: var(--ember); }
    .toast {
      position: fixed;
      right: 20px;
      bottom: 18px;
      width: 360px;
      background: var(--surface-hi);
      border: 1px solid var(--line);
      border-radius: 10px;
      box-shadow: 0 18px 40px -16px rgba(0,0,0,.3);
      padding: 12px;
      display: none;
      z-index: 10;
    }
    .toast.show { display: block; }
    @media (max-width: 1180px) {
      .compose-body { grid-template-columns: 230px minmax(360px, 1fr); }
      .preview-pane { display: none; }
      .page-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .wide-grid, .login-grid, .settings-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 820px) {
      body { overflow: auto; }
      .app { min-height: 100vh; height: auto; grid-template-columns: 1fr; }
      .sidebar { position: static; }
      .main { min-height: 100vh; }
      .compose-body { grid-template-columns: 1fr; overflow: visible; }
      .view.active { overflow: auto; }
      .two, .three, .page-grid { grid-template-columns: 1fr; }
      .topbar { height: auto; align-items: flex-start; padding: 14px; flex-wrap: wrap; }
      .toolbar { margin-left: 0; width: 100%; justify-content: flex-start; flex-wrap: wrap; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="mark">SF</div>
        <div>
          <div class="brand-title">Signal Fire</div>
          <div class="brand-sub">Desktop console</div>
        </div>
      </div>
      <button class="nav-button active" data-nav="compose"><span class="nav-dot">C</span><span>Compose</span></button>
      <button class="nav-button" data-nav="today"><span class="nav-dot">T</span><span>Today</span></button>
      <button class="nav-button" data-nav="accounts"><span class="nav-dot">A</span><span>Accounts</span><span id="brokenBadge" class="pill bad" style="min-width:20px;margin-left:auto;display:none">0</span></button>
      <button class="nav-button" data-nav="schedule"><span class="nav-dot">S</span><span>Schedule</span></button>
      <button class="nav-button" data-nav="history"><span class="nav-dot">H</span><span>History</span></button>
      <div class="sidebar-spacer"></div>
      <button class="nav-button" data-nav="settings"><span class="nav-dot">G</span><span>Settings</span></button>
      <label style="margin-top:8px;color:var(--nav-muted)">Account
        <input id="account" class="account-input" value="main" autocomplete="off">
      </label>
      <div class="account-chip">
        <div class="avatar">M</div>
        <div style="min-width:0">
          <div id="activeBadge" class="chip-main">main</div>
          <div id="saveState" class="chip-sub">Saved locally</div>
        </div>
      </div>
    </aside>

    <main class="main">
      <div class="topbar">
        <div>
          <h1 id="viewTitle">Compose</h1>
          <div id="viewSubtitle" class="top-meta">untitled draft - autosaved locally</div>
        </div>
        <div class="toolbar">
          <button id="refreshStatus" class="btn ghost" type="button">Refresh</button>
          <button id="saveDraft" class="btn compose-action" type="button">Save draft</button>
          <button id="dryRun" class="btn compose-action" type="button">Ready check</button>
          <button id="postSelectedTop" class="btn primary compose-action" type="button">Post to 0</button>
        </div>
      </div>

      <form id="campaignForm" class="view active" data-view="compose">
        <div style="flex:1;display:flex;flex-direction:column;min-height:0">
          <section class="safety">
            <b>Safety profile</b>
            <span>Delay <span id="delaySummary" style="font-family:var(--mono)">120-300s</span></span>
            <span class="rule"></span>
            <span>Cap <span id="capSummary" style="font-family:var(--mono)">4/h - 20/d</span></span>
            <span class="rule"></span>
            <span>Browser <span id="browserSummary" style="font-family:var(--mono)">saved session</span></span>
            <span class="rule"></span>
            <span>Checkpoints <span style="font-family:var(--mono)">manual handoff</span></span>
          </section>

          <div class="compose-body">
            <section class="pane">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px">
                <div class="eyebrow">Targets <span id="targetCount">0 of 6</span></div>
                <button class="btn ghost" type="button" data-nav-jump="accounts" style="min-height:24px;padding:0 4px">Sessions</button>
              </div>
              <div class="card target-list" id="targetList">
                <div class="target-row" data-platform="linkedin">
                  <input type="checkbox" name="targets" value="linkedin">
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#0a66c2">in</span>
                    <span><span class="target-name">LinkedIn <span class="ovr-badge" data-ovr-badge="linkedin" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="linkedin">none</span></span></span>
                  </div>
                </div>
                <div class="target-row" data-platform="x">
                  <input type="checkbox" name="targets" value="x">
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#0a0a0a">X</span>
                    <span><span class="target-name">X <span class="ovr-badge" data-ovr-badge="x" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="x">none</span></span></span>
                  </div>
                </div>
                <div class="target-row selected" data-platform="facebook">
                  <input type="checkbox" name="targets" value="facebook" checked>
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#1877f2">f</span>
                    <span><span class="target-name">Facebook <span class="mini-chip">PAGE</span> <span class="ovr-badge" data-ovr-badge="facebook" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="facebook">none</span></span></span>
                  </div>
                </div>
                <div class="target-row" data-platform="instagram">
                  <input type="checkbox" name="targets" value="instagram" checked>
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#e1306c">IG</span>
                    <span><span class="target-name">Instagram <span class="ovr-badge" data-ovr-badge="instagram" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="instagram">none</span></span></span>
                  </div>
                </div>
                <div class="target-row" data-platform="tiktok">
                  <input type="checkbox" name="targets" value="tiktok">
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#161823">TT</span>
                    <span><span class="target-name">TikTok <span class="ovr-badge" data-ovr-badge="tiktok" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="tiktok">none</span></span></span>
                  </div>
                </div>
                <div class="target-row" data-platform="youtube">
                  <input type="checkbox" name="targets" value="youtube">
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#ff0033">YT</span>
                    <span><span class="target-name">YouTube <span class="ovr-badge" data-ovr-badge="youtube" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="youtube">none</span></span></span>
                  </div>
                </div>
              </div>

              <div class="card pad">
                <div class="eyebrow" style="margin-bottom:10px">Posting as</div>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="avatar">M</div>
                  <div style="min-width:0;flex:1">
                    <div id="postingAccount" style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">main</div>
                    <div style="color:var(--ink-3);font-size:11px">Workspace account</div>
                  </div>
                </div>
              </div>
            </section>

            <section class="pane">
              <div class="card">
                <div class="card-head">
                  <div class="eyebrow">Base caption - inherited by selected platforms</div>
                  <div class="meta-line"><span id="charCount">0</span> chars <span id="baseCaptionCount" class="caption-count" style="margin-left:4px"></span></div>
                </div>
                <div class="caption-box">
                  <label>Text / Caption
                    <textarea name="text" data-save="text" id="textInput" placeholder="Write the post once. Use platform fields below for overrides."></textarea>
                  </label>
                  <label>Title
                    <input name="title" data-save="title" placeholder="Used by YouTube and link previews">
                  </label>
                </div>
                <div class="caption-tools">
                  <label class="file-field"><input type="file" name="image" accept="image/*" data-file-label="imageFileName"><span>Image</span><span id="imageFileName" class="file-name">No file selected</span></label>
                  <label class="file-field"><input type="file" name="video" accept="video/*" data-file-label="videoFileName"><span>Video</span><span id="videoFileName" class="file-name">No file selected</span></label>
                </div>
              </div>

              <div class="card">
                <div class="card-head">
                  <div class="eyebrow">Platform details</div>
                  <span id="detailPlatformLabel" class="pill" style="min-width:80px;text-align:center">Facebook</span>
                </div>
                <div class="caption-box" id="platformDetails">
                  <label data-platform-detail="facebook">Facebook Page URL
                    <input name="pageUrl" data-save="pageUrl" placeholder="https://www.facebook.com/your-page">
                  </label>
                  <label data-platform-detail="facebook">Post As
                    <select name="facebookPostAs" data-save="facebookPostAs">
                      <option value="personal" selected>Personal</option>
                      <option value="page">Page</option>
                    </select>
                  </label>
                  <label data-platform-detail="facebook" data-facebook-page-only>Facebook Page Name
                    <input type="text" name="facebookPageName" data-save="facebookPageName" placeholder="e.g. GrantCue">
                  </label>
                  <label class="check-row" data-platform-detail="facebook"><input type="checkbox" name="facebookDryRun" data-save="facebookDryRun"> Dry run (test without posting)</label>
                  <label class="check-row" data-platform-detail="instagram">
                    <input type="checkbox" name="instagramDryRun" data-save="instagramDryRun"> Dry run (test without posting)
                  </label>
                  <div class="two" data-platform-detail="linkedin">
                    <label>LinkedIn Target
                      <select name="linkedinTarget" data-save="linkedinTarget">
                        <option value="profile">Personal profile</option>
                        <option value="company">Company page</option>
                      </select>
                    </label>
                    <label>LinkedIn Company Page URL
                      <input name="linkedinCompanyPageUrl" data-save="linkedinCompanyPageUrl">
                    </label>
                  </div>
                  <label data-platform-detail="linkedin">LinkedIn Company ID
                    <input type="text" name="linkedinCompanyId" data-save="linkedinCompanyId" placeholder="e.g. 110105724">
                  </label>
                  <label data-platform-detail="linkedin">Post Type
                    <select name="linkedinPostType" data-save="linkedinPostType">
                      <option value="post">Post (short share)</option>
                      <option value="article">Article (long-form)</option>
                    </select>
                  </label>
                  <label data-platform-detail="linkedin" data-linkedin-article-only>Article Title
                    <input type="text" name="linkedinTitle" data-save="linkedinTitle" placeholder="Article title (optional)">
                  </label>
                  <label data-platform-detail="linkedin" data-linkedin-article-only>Share Intro
                    <input type="text" name="linkedinShareIntro" data-save="linkedinShareIntro" placeholder="Intro text for share modal (optional)">
                  </label>
                  <label class="check-row" data-platform-detail="linkedin"><input type="checkbox" name="linkedinDryRun" data-save="linkedinDryRun"> Dry run (test without publishing)</label>
                  <div class="two" data-platform-detail="x">
                    <label>X Community
                      <input name="communityName" data-save="communityName">
                    </label>
                    <label>X Community ID
                      <input name="communityId" data-save="communityId">
                    </label>
                  </div>
                  <label class="check-row" data-platform-detail="x"><input type="checkbox" name="xDryRun" data-save="xDryRun"> Dry run (test without posting)</label>
                  <div class="two" data-platform-detail="tiktok">
                    <label>TikTok Visibility
                      <select name="tiktokVisibility" data-save="tiktokVisibility">
                        <option value="everyone">Everyone</option>
                        <option value="friends">Friends</option>
                        <option value="only_you">Only you</option>
                      </select>
                    </label>
                    <label>Product ID
                      <input name="productId" data-save="productId">
                    </label>
                  </div>
                  <div class="two" data-platform-detail="youtube">
                    <label>YouTube Visibility
                      <select name="youtubeVisibility" data-save="youtubeVisibility">
                        <option value="private">Private</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="public">Public</option>
                      </select>
                    </label>
                    <label>Tags
                      <input name="tags" data-save="tags" placeholder="comma separated">
                    </label>
                  </div>
                  <label data-platform-detail="youtube">Playlist
                    <input name="playlist" data-save="playlist">
                  </label>
                  <div class="override-section">
                    <div class="eyebrow">Caption</div>
                    <label class="check-row" style="font-size:12.5px;text-transform:none;letter-spacing:0;font-weight:700"><input type="checkbox" id="overrideCaptionCheckbox"> Override base caption</label>
                    <div id="overrideCaptionPreview" class="override-preview"></div>
                    <div id="overrideCaptionInputWrap" hidden>
                      <textarea id="overrideCaptionInput" class="compact" placeholder="Enter platform-specific caption..."></textarea>
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
                        <span id="overrideCaptionWarn" class="caption-warn" hidden></span>
                        <span id="overrideCaptionCount" class="caption-count" style="margin-left:auto"></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="pane preview-pane">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px">
                <div class="eyebrow">Live preview</div>
                <span class="pill" id="previewMode">selected</span>
              </div>
              <div class="preview-stack">
                <article class="preview-card">
                  <div class="preview-top">
                    <div class="preview-avatar" style="background:#1877f2">f</div>
                    <div>
                      <div style="font-weight:750">Facebook Page</div>
                      <div class="meta-line">now - public</div>
                    </div>
                  </div>
                  <div id="facebookPreviewText" class="preview-text">Your post text will appear here.</div>
                  <div id="facebookMediaPreview" class="media-preview">Signal Fire</div>
                </article>
                <article class="preview-card">
                  <div class="preview-top">
                    <div class="preview-avatar" style="background:#e1306c">IG</div>
                    <div>
                      <div style="font-weight:750">Instagram</div>
                      <div class="meta-line">feed post</div>
                    </div>
                  </div>
                  <div id="instagramMediaPreview" class="media-preview">Signal Fire</div>
                  <div id="instagramPreviewText" class="preview-text">Caption preview.</div>
                </article>
              </div>
            </section>
          </div>

          <div class="bottom-bar">
            <span class="status-dot ok-dot"></span>
            <span id="bottomStatus">Ready.</span>
            <span style="margin-left:auto;font-family:var(--mono)" id="todayCount">posts today - 0</span>
            <span class="rule"></span>
            <span id="sessionSummary">sessions loading</span>
          </div>
        </div>
      </form>

      <section class="view" data-view="today">
        <div class="page-view active">
          <div class="page-grid">
            <div class="card metric"><span>Fresh sessions</span><strong id="freshCount">0</strong></div>
            <div class="card metric"><span>Stale sessions</span><strong id="staleCount">0</strong></div>
            <div class="card metric"><span>Missing sessions</span><strong id="missingCount">0</strong></div>
            <div class="card metric"><span>Posts today</span><strong id="postCount">0</strong></div>
          </div>
          <div class="wide-grid">
            <div class="card">
              <div class="card-head"><div class="eyebrow">Connection state</div></div>
              <div style="padding:12px">
                <table>
                  <thead><tr><th>Platform</th><th>Session</th><th>Posts 24h</th></tr></thead>
                  <tbody id="todayRows"></tbody>
                </table>
              </div>
            </div>
            <div class="card">
              <div class="card-head"><div class="eyebrow">Activity</div></div>
              <div style="padding:12px">
                <table>
                  <thead><tr><th>Platform</th><th>Result</th><th>Detail</th></tr></thead>
                  <tbody id="resultRowsToday"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="view" data-view="accounts">
        <div class="page-view active">
          <div class="login-grid">
            <div class="card">
              <div class="card-head">
                <div class="eyebrow">Browser login</div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
                  <span class="pill" id="loginPlatformBadge">Facebook</span>
                  <span class="pill none" id="loginSessionBadge">Not verified</span>
                </div>
              </div>
              <div style="padding:14px;display:grid;gap:12px">
                <div class="three">
                  <label>Login platform
                    <select id="activePlatform">
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="x">X</option>
                      <option value="tiktok">TikTok</option>
                      <option value="youtube">YouTube</option>
                    </select>
                  </label>
                  <label>Saved account
                    <select id="accountPicker"></select>
                  </label>
                  <label>Account label
                    <input id="accountMirror" value="main" autocomplete="off">
                  </label>
                </div>
                <label class="check-row"><input type="checkbox" id="useBrowserProfile" checked disabled> Persistent browser profile</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button id="startLogin" class="btn dark" type="button">Open browser login</button>
                  <button id="finishLogin" class="btn primary" type="button" disabled>Verify and save</button>
                  <button id="cancelLogin" class="btn" type="button" disabled>Cancel login</button>
                  <button id="clearSession" class="btn danger" type="button">Clear selected session</button>
                  <button id="deleteAccount" class="btn danger" type="button">Delete account</button>
                </div>
                <div class="meta-line" id="loginSessionDetail">No saved verification for this account.</div>
              </div>
            </div>
            <div class="card">
              <div class="card-head"><div class="eyebrow">Credential login</div><span class="meta-line">All platforms</span></div>
              <div id="credentialForm" style="padding:14px;display:grid;gap:12px">
                <div class="two">
                  <label>Email / username
                    <div style="display:inline-flex;gap:4px;width:100%">
                      <input id="loginIdentity" autocomplete="username" style="flex:1;min-width:0">
                      <button id="copyIdentity" class="btn" type="button" style="padding:4px 8px;font-size:0.8em;white-space:nowrap">Copy</button>
                    </div>
                  </label>
                  <label>Password
                    <div style="display:inline-flex;gap:4px;width:100%">
                      <input id="loginPassword" type="password" autocomplete="current-password" style="flex:1;min-width:0">
                      <button id="copyPassword" class="btn" type="button" style="padding:4px 8px;font-size:0.8em;white-space:nowrap">Copy</button>
                    </div>
                  </label>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <button id="saveCredentials" class="btn" type="button">Save credentials</button>
                  <button id="credentialLogin" class="btn primary" type="button">Login with saved credentials</button>
                  <button id="forgetCredentials" class="btn danger" type="button">Forget saved</button>
                  <span class="meta-line" id="credentialState">No saved credentials.</span>
                  <span class="meta-line">If a checkpoint opens, finish it and use Verify and save.</span>
                </div>
              </div>
            </div>
          </div>
          <div class="card" style="margin-top:16px">
            <div class="card-head"><div class="eyebrow">Accounts</div></div>
            <div style="padding:12px">
              <table>
                <thead><tr><th>Platform</th><th>Session</th><th>Validated</th><th>Posts 1h</th><th>Posts 24h</th></tr></thead>
                <tbody id="statusRows"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section class="view" data-view="schedule">
        <div class="page-view active">
          <div class="wide-grid">
            <div class="card">
              <div class="card-head"><div class="eyebrow">Schedule</div></div>
              <div style="padding:14px;display:grid;gap:12px">
                <label>Post time
                  <input type="datetime-local" name="schedule" data-save="schedule" form="campaignForm">
                </label>
                <div class="meta-line">Leave blank to post immediately.</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button id="saveQueue" class="btn primary" type="button">Save to queue</button>
                  <button id="refreshQueue" class="btn" type="button">Refresh queue</button>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-head"><div class="eyebrow">Queue preview</div></div>
              <div style="padding:14px;display:grid;gap:10px" id="schedulePreview"></div>
            </div>
          </div>
          <div class="card" style="margin-top:16px">
            <div class="card-head"><div class="eyebrow">Saved queue</div></div>
            <div style="padding:12px">
              <table>
                <thead><tr><th>When</th><th>Targets</th><th>Status</th><th>Text</th><th></th></tr></thead>
                <tbody id="queueRows"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section class="view" data-view="history">
        <div class="page-view active">
          <div class="card">
            <div class="card-head"><div class="eyebrow">Run results</div><button class="btn" type="button" id="clearResults">Clear history</button></div>
            <div style="padding:12px">
              <table>
                <thead><tr><th>Time</th><th>Platform</th><th>Result</th><th>Detail</th><th>Text</th></tr></thead>
                <tbody id="resultRows"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section class="view" data-view="settings">
        <div class="page-view active">
          <div class="settings-grid">
            <div class="card">
              <div class="card-head"><div class="eyebrow">Pacing and safety</div></div>
              <div style="padding:14px;display:grid;gap:12px">
                <div class="two">
                  <label>Delay min seconds
                    <input name="campaignDelayMinSeconds" data-save="campaignDelayMinSeconds" inputmode="numeric" form="campaignForm">
                  </label>
                  <label>Delay max seconds
                    <input name="campaignDelayMaxSeconds" data-save="campaignDelayMaxSeconds" inputmode="numeric" form="campaignForm">
                  </label>
                </div>
                <div class="two">
                  <label>Post cap / hour
                    <input name="postLimitPerHour" data-save="postLimitPerHour" inputmode="numeric" form="campaignForm">
                  </label>
                  <label>Post cap / day
                    <input name="postLimitPerDay" data-save="postLimitPerDay" inputmode="numeric" form="campaignForm">
                  </label>
                </div>
                <div class="three">
                  <label class="check-row"><input type="checkbox" name="allowComments" data-save="allowComments" form="campaignForm" checked> Comments</label>
                  <label class="check-row"><input type="checkbox" name="allowDuet" data-save="allowDuet" form="campaignForm" checked> Duet</label>
                  <label class="check-row"><input type="checkbox" name="allowStitch" data-save="allowStitch" form="campaignForm" checked> Stitch</label>
                </div>
                <label class="check-row"><input type="checkbox" name="madeForKids" data-save="madeForKids" form="campaignForm"> Made for kids</label>
              </div>
            </div>
            <div class="card">
              <div class="card-head"><div class="eyebrow">Browser runtime</div></div>
              <div style="padding:14px;display:grid;gap:12px">
                <label>Slow motion ms
                  <input name="slowMoMs" data-save="slowMoMs" inputmode="numeric" form="campaignForm">
                </label>
                <div class="two">
                  <label class="file-field"><input type="file" name="cover" accept="image/*" form="campaignForm" data-file-label="coverFileName"><span>Cover</span><span id="coverFileName" class="file-name">No file selected</span></label>
                  <label class="file-field"><input type="file" name="thumbnail" accept="image/*" form="campaignForm" data-file-label="thumbnailFileName"><span>Thumbnail</span><span id="thumbnailFileName" class="file-name">No file selected</span></label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
  <div class="toast" id="toast"><strong id="toastTitle">Signal Fire</strong><div id="toastBody" class="meta-line" style="margin-top:5px"></div></div>

  <script>
    var platformNames = {
      tiktok: 'TikTok',
      x: 'X',
      facebook: 'Facebook',
      linkedin: 'LinkedIn',
      youtube: 'YouTube',
      instagram: 'Instagram'
    };
    var platformColors = {
      tiktok: '#161823',
      x: '#0a0a0a',
      facebook: '#1877f2',
      linkedin: '#0a66c2',
      youtube: '#ff0033',
      instagram: '#e1306c'
    };
    var CAPTION_LIMITS = { x: 280, instagram: 2200, tiktok: 2200, linkedin: 3000, youtube: 5000, facebook: 63206 };
    var overrideText = {};
    var overrideEnabled = {};
    var activeFlowId = null;
    var saveTimer = null;
    var selectedDetailPlatform = 'facebook';
    var credentialLoadTimer = null;
    var latestResults = [];
    var latestStatusRows = [];
    var queuedEntries = [];
    var historyEntries = [];
    var activeView = 'compose';
    var accountEl = document.getElementById('account');
    var accountMirrorEl = document.getElementById('accountMirror');
    var accountPickerEl = document.getElementById('accountPicker');
    var activePlatformEl = document.getElementById('activePlatform');
    var useProfileEl = document.getElementById('useBrowserProfile');
    var formEl = document.getElementById('campaignForm');
    var finishLoginEl = document.getElementById('finishLogin');
    var cancelLoginEl = document.getElementById('cancelLogin');
    var credentialLoginEl = document.getElementById('credentialLogin');
    var saveCredentialsEl = document.getElementById('saveCredentials');
    var forgetCredentialsEl = document.getElementById('forgetCredentials');
    var credentialStateEl = document.getElementById('credentialState');
    var loginIdentityEl = document.getElementById('loginIdentity');
    var loginPasswordEl = document.getElementById('loginPassword');
    var copyIdentityEl = document.getElementById('copyIdentity');
    var copyPasswordEl = document.getElementById('copyPassword');
    var knownAccounts = ['main'];

    function normalizedAccount(value) {
      return (value || '').replace(/\s+/g, ' ').trim();
    }

    function currentAccount() {
      return normalizedAccount(accountEl.value || accountMirrorEl.value) || 'main';
    }

    function displayAccount() {
      return accountEl.value || accountMirrorEl.value || 'main';
    }
    function currentPlatform() { return activePlatformEl.value; }
    function supportsCredentialLogin(platform) { return Boolean(platformNames[platform]); }

    function setAccountInputs(value) {
      accountEl.value = value;
      accountMirrorEl.value = value;
    }

    function syncAccountPicker() {
      var account = currentAccount();
      var exists = knownAccounts.indexOf(account) !== -1;
      if (!exists && account.length > 0) {
        var custom = accountPickerEl.querySelector('[data-custom-account="true"]');
        if (!custom) {
          custom = document.createElement('option');
          custom.dataset.customAccount = 'true';
          accountPickerEl.appendChild(custom);
        }
        custom.value = account;
        custom.textContent = account + ' (new)';
      }
      accountPickerEl.value = account;
    }

    function renderAccountPicker(accounts) {
      knownAccounts = (accounts || []).filter(function(account, index, list) {
        return account && list.indexOf(account) === index;
      });
      var account = currentAccount();
      if (account.length > 0 && knownAccounts.indexOf(account) === -1) knownAccounts.push(account);
      accountPickerEl.replaceChildren();
      knownAccounts.forEach(function(accountName) {
        var option = document.createElement('option');
        option.value = accountName;
        option.textContent = accountName;
        accountPickerEl.appendChild(option);
      });
      var deleteBtn = document.getElementById('deleteAccount');
      if (deleteBtn) {
        var isLast = knownAccounts.length <= 1;
        deleteBtn.disabled = isLast;
        deleteBtn.title = isLast ? 'Cannot delete the last remaining account' : '';
      }
      syncAccountPicker();
    }

    function showToast(title, body, tone) {
      var toast = document.getElementById('toast');
      document.getElementById('toastTitle').textContent = title;
      document.getElementById('toastBody').textContent = body;
      toast.className = 'toast show' + (tone ? ' ' + tone : '');
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(function() { toast.className = 'toast'; }, 4200);
    }

    function setBottom(message, tone) {
      var el = document.getElementById('bottomStatus');
      el.textContent = message;
      if (tone) showToast(tone === 'bad' ? 'Needs attention' : 'Signal Fire', message, tone);
    }

    async function api(path, options) {
      var response = await fetch(path, options || {});
      var data = await response.json();
      if (!response.ok || data.ok === false) {
        var error = new Error(data.error || 'Request failed');
        error.status = response.status;
        throw error;
      }
      return data;
    }

    async function refreshAccounts() {
      try {
        var data = await api('/api/accounts');
        renderAccountPicker(data.accounts || []);
        return true;
      } catch (err) {
        renderAccountPicker([]);
        setBottom('Could not load saved accounts: ' + err.message, 'bad');
        return false;
      }
    }

    function setCredentialState(message) {
      credentialStateEl.textContent = message;
    }

    function setCredentialButtonsEnabled(enabled) {
      var supported = enabled && supportsCredentialLogin(currentPlatform());
      credentialLoginEl.disabled = !supported;
      saveCredentialsEl.disabled = !supported;
      forgetCredentialsEl.disabled = !supported;
    }

    function credentialPayload() {
      return {
        platform: currentPlatform(),
        account: currentAccount(),
        identity: loginIdentityEl.value,
        password: loginPasswordEl.value
      };
    }

    async function loadCredentials() {
      if (!supportsCredentialLogin(currentPlatform())) {
        loginIdentityEl.value = '';
        loginPasswordEl.value = '';
        setCredentialState('Credential login is not supported for this platform.');
        setCredentialButtonsEnabled(false);
        return null;
      }

      setCredentialState('Checking saved credentials...');
      var data = await api(
        '/api/credentials?platform=' + encodeURIComponent(currentPlatform()) +
        '&account=' + encodeURIComponent(currentAccount())
      );
      if (!data.credentials) {
        loginIdentityEl.value = '';
        loginPasswordEl.value = '';
        setCredentialState('No saved credentials.');
        setCredentialButtonsEnabled(true);
        return null;
      }

      loginIdentityEl.value = data.credentials.identity || '';
      loginPasswordEl.value = data.credentials.password || '';
      setCredentialState('Credentials saved ' + new Date(data.credentials.updatedAt).toLocaleString() + '.');
      setCredentialButtonsEnabled(true);
      return data.credentials;
    }

    function loadCredentialsSoon() {
      clearTimeout(credentialLoadTimer);
      credentialLoadTimer = setTimeout(function() {
        loadCredentials().catch(handleCredentialLoadError);
      }, 300);
    }

    function handleCredentialLoadError(err) {
      setCredentialState(err.message);
      if (err.status !== 404) setBottom('Could not load saved credentials: ' + err.message, 'bad');
    }

    async function saveCredentialsFromFields() {
      var payload = credentialPayload();
      if (!payload.identity.trim()) throw new Error('Email or username is required');
      if (!payload.password) throw new Error('Password is required');
      var data = await api('/api/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setCredentialState('Credentials saved ' + new Date(data.credentials.updatedAt).toLocaleString() + '.');
      return data.credentials;
    }

    async function ensureCredentialsReady() {
      if (!loginIdentityEl.value.trim() || !loginPasswordEl.value) {
        await loadCredentials();
      }
      return saveCredentialsFromFields();
    }

    function selectedTargets() {
      return Array.from(formEl.querySelectorAll('input[name="targets"]:checked')).map(function(input) {
        return input.value;
      });
    }

    function setView(view) {
      activeView = view;
      document.querySelectorAll('[data-nav]').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.nav === view);
      });
      document.querySelectorAll('.view[data-view]').forEach(function(section) {
        section.classList.toggle('active', section.dataset.view === view);
      });
      var titles = {
        compose: ['Compose', 'draft workspace - post once, adapt per platform'],
        today: ['Today', 'session health and recent posting state'],
        accounts: ['Accounts', 'login, verify, and repair saved sessions'],
        schedule: ['Schedule', 'set the timing for the selected post'],
        history: ['History', 'saved posting history for this account'],
        settings: ['Settings', 'safety, browser, and proxy profile']
      };
      var pair = titles[view] || titles.compose;
      document.getElementById('viewTitle').textContent = pair[0];
      document.getElementById('viewSubtitle').textContent = pair[1];
      document.querySelectorAll('.compose-action').forEach(function(action) {
        action.style.display = view === 'compose' ? 'inline-flex' : 'none';
      });
      if (view === 'schedule') refreshQueue().catch(function(err) { setBottom(err.message, 'bad'); });
      if (view === 'history') refreshHistory().catch(function(err) { setBottom(err.message, 'bad'); });
    }

    function collectState() {
      var fields = {};
      document.querySelectorAll('[data-save]').forEach(function(input) {
        fields[input.dataset.save] = input.type === 'checkbox' ? input.checked : input.value;
      });
      fields.useBrowserProfile = useProfileEl.checked;
      return {
        account: currentAccount(),
        activePlatform: currentPlatform(),
        targets: selectedTargets(),
        fields: fields,
        overrideText: overrideText,
        overrideEnabled: overrideEnabled
      };
    }

    async function saveStateNow() {
      document.getElementById('saveState').textContent = 'Saving...';
      await api('/api/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(collectState())
      });
      document.getElementById('saveState').textContent = 'Saved locally';
    }

    function saveStateSoon() {
      document.getElementById('saveState').textContent = 'Unsaved changes';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function() {
        saveStateNow().catch(function(err) { document.getElementById('saveState').textContent = err.message; });
      }, 450);
    }

    function applyState(state) {
      if (state.account) {
        accountEl.value = state.account;
        accountMirrorEl.value = state.account;
      }
      if (state.activePlatform) activePlatformEl.value = state.activePlatform;
      if (Array.isArray(state.targets)) {
        formEl.querySelectorAll('input[name="targets"]').forEach(function(input) {
          input.checked = state.targets.indexOf(input.value) !== -1;
        });
        if (state.targets.length > 0) selectedDetailPlatform = state.targets[0];
      }
      if (state.overrideText && typeof state.overrideText === 'object') overrideText = state.overrideText;
      if (state.overrideEnabled && typeof state.overrideEnabled === 'object') overrideEnabled = state.overrideEnabled;
      updateOvrBadges();
      if (state.fields) {
        if ('useBrowserProfile' in state.fields) useProfileEl.checked = true; // legacy state may have false; checkbox is disabled and feature is always-on
        document.querySelectorAll('[data-save]').forEach(function(input) {
          var key = input.dataset.save;
          if (!(key in state.fields)) return;
          if (input.type === 'checkbox') input.checked = state.fields[key] === true;
          else input.value = state.fields[key] || '';
        });
      }
      updateAll();
    }

    function markStatusUnavailable() {
      latestStatusRows = [];
      document.querySelectorAll('[data-session-label]').forEach(function(label) {
        label.textContent = '-';
        var dot = label.parentElement.querySelector('.status-dot');
        if (dot) dot.className = 'status-dot none-dot';
      });
      document.getElementById('sessionSummary').textContent = 'session status unavailable';
      updateLoginSessionStatus();
    }

    function reportSettledFailures(results, label) {
      var failures = results.filter(function(result) { return result.status === 'rejected'; });
      if (failures.length === 0) return;
      var detail = failures.map(function(result) { return result.reason.message; }).join('; ');
      setBottom(label + ': ' + detail, 'bad');
    }

    async function refreshAccountData() {
      var results = await Promise.allSettled([
        refreshStatus(),
        refreshHistory(),
        refreshQueue()
      ]);
      if (results[0] && results[0].status === 'rejected') markStatusUnavailable();
      reportSettledFailures(results, 'Could not refresh account data');
    }

    function updateAll() {
      var account = currentAccount();
      var visibleAccount = displayAccount();
      if (document.activeElement !== accountMirrorEl) accountMirrorEl.value = visibleAccount;
      if (document.activeElement !== accountEl) accountEl.value = visibleAccount;
      document.getElementById('activeBadge').textContent = account;
      document.getElementById('postingAccount').textContent = account;
      document.getElementById('loginPlatformBadge').textContent = platformNames[currentPlatform()];
      syncAccountPicker();
      setCredentialButtonsEnabled(true);
      var targets = selectedTargets();
      document.getElementById('targetCount').textContent = targets.length + ' of 6';
      document.getElementById('postSelectedTop').textContent = 'Post to ' + targets.length;
      var baseText = document.getElementById('textInput').value || '';
      document.getElementById('charCount').textContent = String(baseText.length);
      updateBaseCaptionCount(baseText);
      document.getElementById('delaySummary').textContent =
        (document.querySelector('[name="campaignDelayMinSeconds"]').value || '0') + '-' +
        (document.querySelector('[name="campaignDelayMaxSeconds"]').value || '0') + 's';
      document.getElementById('capSummary').textContent =
        (document.querySelector('[name="postLimitPerHour"]').value || 'off') + '/h - ' +
        (document.querySelector('[name="postLimitPerDay"]').value || 'off') + '/d';
      document.getElementById('browserSummary').textContent = useProfileEl.checked ? 'persistent profile' : 'storage state';
      updateLoginSessionStatus();
      updatePreview();
      updateTargetSelection();
      updateSchedulePreview();
    }

    function updatePreview() {
      var text = document.getElementById('textInput').value.trim();
      var fallback = 'Your post text will appear here.';
      document.getElementById('facebookPreviewText').textContent = text || fallback;
      document.getElementById('instagramPreviewText').textContent = text || 'Caption preview.';
    }

    function updateLinkedInArticleFields() {
      var postTypeEl = document.querySelector('[name="linkedinPostType"]');
      var isArticle = postTypeEl && postTypeEl.value === 'article';
      document.querySelectorAll('[data-linkedin-article-only]').forEach(function(el) {
        el.hidden = !isArticle;
      });
    }

    function updateFacebookPageFields() {
      var postAsEl = document.querySelector('[name="facebookPostAs"]');
      var isPage = postAsEl && postAsEl.value === 'page';
      document.querySelectorAll('[data-facebook-page-only]').forEach(function(el) {
        el.hidden = !isPage;
      });
    }

    function updateTargetSelection() {
      var selected = selectedDetailPlatform;
      document.querySelectorAll('.target-row').forEach(function(row) {
        row.classList.toggle('selected', row.dataset.platform === selected);
      });
      document.querySelectorAll('[data-platform-detail]').forEach(function(row) {
        var platforms = (row.dataset.platformDetail || '').split(/\s+/);
        row.hidden = platforms.indexOf(selected) === -1;
      });
      document.querySelectorAll('[data-platform-empty]').forEach(function(row) {
        row.hidden = row.dataset.platformEmpty !== selected;
      });
      var labelEl = document.getElementById('detailPlatformLabel');
      if (labelEl) labelEl.textContent = platformNames[selected] || selected;
      updateOverrideSection(selected);
      updateLinkedInArticleFields();
      updateFacebookPageFields();
    }

    function updateFileLabel(input) {
      var id = input.dataset.fileLabel;
      if (!id) return;
      var label = document.getElementById(id);
      label.textContent = input.files && input.files.length ? input.files[0].name : 'No file selected';
      if (input.name === 'image' && input.files && input.files[0]) {
        var url = URL.createObjectURL(input.files[0]);
        ['facebookMediaPreview', 'instagramMediaPreview'].forEach(function(previewId) {
          var box = document.getElementById(previewId);
          box.textContent = '';
          box.innerHTML = '<img alt="">';
          box.querySelector('img').src = url;
        });
      }
    }

    function updateOvrBadges() {
      document.querySelectorAll('[data-ovr-badge]').forEach(function(badge) {
        badge.hidden = !overrideEnabled[badge.dataset.ovrBadge];
      });
    }

    function updateBaseCaptionCount(text) {
      var countEl = document.getElementById('baseCaptionCount');
      if (!countEl) return;
      var targets = selectedTargets();
      var nonOverridden = targets.filter(function(p) { return !overrideEnabled[p]; });
      if (nonOverridden.length === 0) {
        countEl.textContent = '';
        countEl.className = 'caption-count';
        return;
      }
      var limits = nonOverridden.map(function(p) { return CAPTION_LIMITS[p] || Infinity; });
      var minLimit = Math.min.apply(null, limits);
      var len = (text || '').length;
      countEl.textContent = len + ' / ' + minLimit;
      countEl.className = 'caption-count' + (len > minLimit ? ' over' : '');
    }

    function updateOverrideSection(platform) {
      var checkbox = document.getElementById('overrideCaptionCheckbox');
      var preview = document.getElementById('overrideCaptionPreview');
      var inputWrap = document.getElementById('overrideCaptionInputWrap');
      var input = document.getElementById('overrideCaptionInput');
      var countEl = document.getElementById('overrideCaptionCount');
      var warnEl = document.getElementById('overrideCaptionWarn');
      if (!checkbox || !preview || !inputWrap || !input || !countEl || !warnEl) return;

      var enabled = !!overrideEnabled[platform];
      checkbox.checked = enabled;

      if (enabled) {
        preview.hidden = true;
        inputWrap.hidden = false;
        input.value = overrideText[platform] || '';
        updateOverrideCaptionCount(platform, input.value);
      } else {
        var baseText = document.getElementById('textInput').value || '';
        var charCount = baseText.length;
        preview.hidden = false;
        preview.textContent = baseText.length > 0
          ? 'Will use base caption (' + charCount + ' chars)'
          : 'Will use base caption (empty)';
        inputWrap.hidden = true;
        countEl.textContent = '';
        countEl.className = 'caption-count';
        warnEl.hidden = true;
      }
    }

    function updateOverrideCaptionCount(platform, text) {
      var countEl = document.getElementById('overrideCaptionCount');
      var warnEl = document.getElementById('overrideCaptionWarn');
      if (!countEl || !warnEl) return;
      var limit = CAPTION_LIMITS[platform];
      if (!limit) {
        countEl.textContent = String((text || '').length) + ' chars';
        countEl.className = 'caption-count';
        warnEl.hidden = true;
        return;
      }
      var len = (text || '').length;
      countEl.textContent = len + ' / ' + limit;
      var over = len > limit;
      countEl.className = 'caption-count' + (over ? ' over' : '');
      warnEl.hidden = !over;
      warnEl.textContent = over ? 'Exceeds ' + platformNames[platform] + ' limit — post may fail' : '';
    }

    function updateSchedulePreview() {
      var target = document.getElementById('schedulePreview');
      var schedule = document.querySelector('[name="schedule"]').value;
      var targets = selectedTargets();
      target.replaceChildren();
      if (targets.length === 0) {
        target.textContent = 'No targets selected.';
        return;
      }
      targets.forEach(function(platform, index) {
        var row = document.createElement('div');
        row.className = 'card pad';
        row.style.boxShadow = 'none';
        row.innerHTML =
          '<div style="display:flex;align-items:center;gap:10px">' +
          '<span class="platform-square" style="background:' + platformColors[platform] + '">' + platformNames[platform].slice(0, 2) + '</span>' +
          '<strong>' + platformNames[platform] + '</strong>' +
          '<span class="meta-line" style="margin-left:auto">' + (schedule || 'post now') + (index > 0 ? ' plus pacing delay' : '') + '</span>' +
          '</div>';
        target.appendChild(row);
      });
    }

    function metric(id, value) {
      document.getElementById(id).textContent = String(value);
    }

    function pill(session) {
      return '<span class="pill ' + session + '">' + session + '</span>';
    }

    function formatDateTime(value) {
      if (!value) return '-';
      var date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    function updateLoginSessionStatus() {
      var badge = document.getElementById('loginSessionBadge');
      var detail = document.getElementById('loginSessionDetail');
      var row = latestStatusRows.find(function(item) {
        return item.platform === currentPlatform();
      });
      var session = row ? row.session : 'none';
      badge.className = 'pill ' + session;

      if (session === 'fresh') {
        badge.textContent = 'Verified';
        detail.textContent = 'Verified for ' + platformNames[currentPlatform()] + ' / ' + currentAccount() + (row.lastValidated ? ' at ' + formatDateTime(row.lastValidated) + '.' : '.');
      } else if (session === 'stale') {
        badge.textContent = 'Needs recheck';
        detail.textContent = 'Saved session exists, but it is stale. Open browser login, confirm the account, then verify again.';
      } else {
        badge.textContent = 'Not verified';
        detail.textContent = 'No saved verification for ' + platformNames[currentPlatform()] + ' / ' + currentAccount() + '.';
      }

      if (activeFlowId) {
        finishLoginEl.textContent = 'Verify and save';
        finishLoginEl.disabled = false;
      } else if (session === 'fresh') {
        finishLoginEl.textContent = 'Verified';
        finishLoginEl.disabled = true;
      } else {
        finishLoginEl.textContent = 'Verify and save';
        finishLoginEl.disabled = true;
      }
    }

    function resultLabel(result) {
      if (result.status) return result.status;
      return result.ok ? 'posted' : 'failed';
    }

    function resultTone(result) {
      var label = resultLabel(result);
      if (label === 'posted') return 'ok';
      if (label === 'queued' || label === 'posting') return 'warn';
      if (label === 'skipped' || label === 'canceled') return 'none';
      return result.ok ? 'ok' : 'bad';
    }

    function resultDetail(result) {
      return result.detail || result.url || result.error || '-';
    }

    function appendTextCell(row, value) {
      var td = document.createElement('td');
      td.textContent = value || '-';
      row.appendChild(td);
      return td;
    }

    function appendStatusCell(row, label, tone) {
      var td = document.createElement('td');
      var span = document.createElement('span');
      span.className = 'pill ' + tone;
      span.textContent = label;
      td.appendChild(span);
      row.appendChild(td);
      return td;
    }

    async function refreshStatus() {
      var data = await api('/api/status?account=' + encodeURIComponent(currentAccount()));
      latestStatusRows = data.rows || [];
      var rowsEl = document.getElementById('statusRows');
      var todayRowsEl = document.getElementById('todayRows');
      rowsEl.replaceChildren();
      todayRowsEl.replaceChildren();
      var fresh = 0, stale = 0, missing = 0, posts = 0, broken = 0;
      latestStatusRows.forEach(function(row) {
        if (row.session === 'fresh') fresh++;
        if (row.session === 'stale') stale++;
        if (row.session === 'none') missing++;
        if (row.session !== 'fresh') broken++;
        posts += row.postsPerDay;
        var statusLabel = document.querySelector('[data-session-label="' + row.platform + '"]');
        if (statusLabel) {
          statusLabel.textContent = row.session;
          var dot = statusLabel.parentElement.querySelector('.status-dot');
          dot.className = 'status-dot ' + (row.session === 'fresh' ? 'ok-dot' : row.session === 'stale' ? 'warn-dot' : 'none-dot');
        }
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + platformNames[row.platform] + '</td>' +
          '<td>' + pill(row.session) + '</td>' +
          '<td>' + (row.lastValidated || '-') + '</td>' +
          '<td>' + row.postsPerHour + '</td>' +
          '<td>' + row.postsPerDay + '</td>';
        rowsEl.appendChild(tr);
        var today = document.createElement('tr');
        today.innerHTML =
          '<td>' + platformNames[row.platform] + '</td>' +
          '<td>' + pill(row.session) + '</td>' +
          '<td>' + row.postsPerDay + '</td>';
        todayRowsEl.appendChild(today);
      });
      metric('freshCount', fresh);
      metric('staleCount', stale);
      metric('missingCount', missing);
      metric('postCount', posts);
      document.getElementById('todayCount').textContent = 'posts today - ' + posts;
      document.getElementById('sessionSummary').textContent = fresh + ' fresh - ' + stale + ' stale - ' + missing + ' missing';
      document.getElementById('brokenBadge').style.display = broken > 0 ? 'inline-flex' : 'none';
      document.getElementById('brokenBadge').textContent = String(broken);
      updateLoginSessionStatus();
      updateAll();
    }

    function renderResults(results) {
      latestResults = results || [];
      var el = document.getElementById('resultRowsToday');
      el.replaceChildren();
      if (latestResults.length === 0) {
        var empty = document.createElement('tr');
        var emptyCell = document.createElement('td');
        emptyCell.colSpan = 3;
        emptyCell.textContent = 'No activity yet.';
        empty.appendChild(emptyCell);
        el.appendChild(empty);
        return;
      }
      latestResults.forEach(function(result) {
        var tr = document.createElement('tr');
        appendTextCell(tr, platformNames[result.platform]);
        appendStatusCell(tr, resultLabel(result), resultTone(result));
        appendTextCell(tr, resultDetail(result)).title = resultDetail(result);
        el.appendChild(tr);
      });
    }

    function renderHistory(entries) {
      historyEntries = entries || [];
      var el = document.getElementById('resultRows');
      el.replaceChildren();
      if (historyEntries.length === 0) {
        var empty = document.createElement('tr');
        var emptyCell = document.createElement('td');
        emptyCell.colSpan = 5;
        emptyCell.textContent = 'No saved history yet.';
        empty.appendChild(emptyCell);
        el.appendChild(empty);
        return;
      }
      historyEntries.forEach(function(entry) {
        var tr = document.createElement('tr');
        appendTextCell(tr, formatDateTime(entry.createdAt));
        appendTextCell(tr, platformNames[entry.platform]);
        appendStatusCell(tr, entry.status, resultTone(entry));
        appendTextCell(tr, resultDetail(entry)).title = resultDetail(entry);
        appendTextCell(tr, entry.textPreview);
        el.appendChild(tr);
      });
    }

    function renderQueue(entries) {
      queuedEntries = entries || [];
      var el = document.getElementById('queueRows');
      el.replaceChildren();
      if (queuedEntries.length === 0) {
        var empty = document.createElement('tr');
        var emptyCell = document.createElement('td');
        emptyCell.colSpan = 5;
        emptyCell.textContent = 'Nothing queued yet.';
        empty.appendChild(emptyCell);
        el.appendChild(empty);
        return;
      }
      queuedEntries.forEach(function(entry) {
        var tr = document.createElement('tr');
        appendTextCell(tr, formatDateTime(entry.scheduledAt));
        appendTextCell(tr, entry.targets.map(function(platform) { return platformNames[platform]; }).join(', '));
        appendStatusCell(tr, entry.status, resultTone({ ok: entry.status === 'posted', status: entry.status }));
        appendTextCell(tr, entry.textPreview);
        var actionCell = document.createElement('td');
        if (entry.status === 'queued') {
          var cancel = document.createElement('button');
          cancel.className = 'btn danger';
          cancel.type = 'button';
          cancel.dataset.cancelQueue = entry.id;
          cancel.textContent = 'Cancel';
          actionCell.appendChild(cancel);
        }
        tr.appendChild(actionCell);
        el.appendChild(tr);
      });
    }

    async function refreshHistory() {
      var data = await api('/api/history?account=' + encodeURIComponent(currentAccount()));
      renderHistory(data.entries || []);
    }

    async function refreshQueue() {
      var data = await api('/api/queue?account=' + encodeURIComponent(currentAccount()));
      renderQueue(data.entries || []);
    }

    function setLoginFlowActive(active) {
      if (active) {
        finishLoginEl.textContent = 'Verify and save';
        finishLoginEl.disabled = false;
      }
      cancelLoginEl.disabled = !active;
      if (!active) updateLoginSessionStatus();
    }

    function appendOverrideFields(form) {
      Object.keys(overrideEnabled).forEach(function(platform) {
        if (overrideEnabled[platform]) {
          form.set('overrideEnabled_' + platform, 'on');
        }
      });
      Object.keys(overrideText).forEach(function(platform) {
        if (overrideText[platform] !== undefined && overrideText[platform] !== '') {
          form.set('overrideText_' + platform, overrideText[platform]);
        }
      });
    }

    async function runCampaign() {
      setBottom('Posting selected platforms sequentially...', '');
      document.getElementById('postSelectedTop').disabled = true;
      var form = new FormData(formEl);
      form.set('account', currentAccount());
      if (useProfileEl.checked) form.set('useBrowserProfile', 'on');
      appendOverrideFields(form);
      try {
        await saveStateNow();
        var result = await api('/api/campaign', { method: 'POST', body: form });
        renderResults(result.results);
        setBottom(
          result.queued ? 'Campaign queued.' : result.campaignOk ? 'Campaign finished.' : 'Campaign finished with failures.',
          result.campaignOk ? 'good' : 'bad'
        );
        await refreshHistory();
        await refreshQueue();
        await refreshStatus();
        setView(result.queued ? 'schedule' : 'history');
      } catch (err) {
        setBottom(err.message, 'bad');
      } finally {
        document.getElementById('postSelectedTop').disabled = false;
      }
    }

    async function saveQueue() {
      var scheduleInput = document.querySelector('[name="schedule"]');
      if (!scheduleInput.value) {
        setBottom('Choose a schedule time to queue', 'bad');
        return;
      }
      setBottom('Saving scheduled post...', '');
      var button = document.getElementById('saveQueue');
      button.disabled = true;
      var form = new FormData(formEl);
      form.set('account', currentAccount());
      if (useProfileEl.checked) form.set('useBrowserProfile', 'on');
      appendOverrideFields(form);
      try {
        await saveStateNow();
        await api('/api/queue', { method: 'POST', body: form });
        await refreshQueue();
        setBottom('Scheduled post saved.', 'good');
        setView('schedule');
      } catch (err) {
        setBottom(err.message, 'bad');
      } finally {
        button.disabled = false;
      }
    }

    document.querySelectorAll('[data-nav], [data-nav-jump]').forEach(function(btn) {
      btn.addEventListener('click', function() { setView(btn.dataset.nav || btn.dataset.navJump); });
    });
    formEl.addEventListener('submit', function(event) {
      event.preventDefault();
      runCampaign();
    });
    document.getElementById('postSelectedTop').addEventListener('click', runCampaign);
    document.getElementById('dryRun').addEventListener('click', function() {
      showToast('Ready check', 'Selected targets and inputs are ready for a manual review.', 'good');
    });
    document.getElementById('saveDraft').addEventListener('click', function() {
      saveStateNow().then(function() { showToast('Draft saved', 'Local draft state updated.', 'good'); }).catch(function(err) { setBottom(err.message, 'bad'); });
    });
    document.getElementById('refreshStatus').addEventListener('click', function() {
      refreshStatus().catch(function(err) {
        markStatusUnavailable();
        setBottom(err.message, 'bad');
      });
    });
    document.getElementById('saveQueue').addEventListener('click', function() {
      saveQueue().catch(function(err) { setBottom(err.message, 'bad'); });
    });
    document.getElementById('refreshQueue').addEventListener('click', function() {
      refreshQueue().catch(function(err) { setBottom(err.message, 'bad'); });
    });
    document.getElementById('queueRows').addEventListener('click', async function(event) {
      var button = event.target.closest('[data-cancel-queue]');
      if (!button) return;
      button.disabled = true;
      try {
        await api('/api/queue/cancel', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: button.dataset.cancelQueue })
        });
        await refreshQueue();
        setBottom('Queue item canceled.', 'good');
      } catch (err) {
        setBottom(err.message, 'bad');
      }
    });
    document.getElementById('clearResults').addEventListener('click', async function() {
      try {
        await api('/api/history/clear', { method: 'POST' });
        renderHistory([]);
        renderResults([]);
        setBottom('History cleared.', 'good');
      } catch (err) {
        setBottom(err.message, 'bad');
      }
    });

    document.getElementById('startLogin').addEventListener('click', async function() {
      setBottom('Opening login browser...', '');
      try {
        var data = await api('/api/login/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            platform: currentPlatform(),
            account: currentAccount(),
            useBrowserProfile: useProfileEl.checked
          })
        });
        activeFlowId = data.flowId;
        setLoginFlowActive(true);
        setBottom('Login browser opened.', 'good');
      } catch (err) {
        setBottom(err.message, 'bad');
      }
    });

    saveCredentialsEl.addEventListener('click', async function() {
      if (!supportsCredentialLogin(currentPlatform())) {
        setBottom('Choose a supported platform first.', 'bad');
        return;
      }
      saveCredentialsEl.disabled = true;
      try {
        await saveCredentialsFromFields();
        setBottom('Credentials saved for ' + platformNames[currentPlatform()] + '.', 'good');
      } catch (err) {
        setBottom(err.message, 'bad');
      } finally {
        setCredentialButtonsEnabled(true);
      }
    });

    forgetCredentialsEl.addEventListener('click', async function() {
      forgetCredentialsEl.disabled = true;
      try {
        await api('/api/credentials/clear', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ platform: currentPlatform(), account: currentAccount() })
        });
        loginIdentityEl.value = '';
        loginPasswordEl.value = '';
        setCredentialState('No saved credentials.');
        setBottom('Saved credentials removed.', 'good');
      } catch (err) {
        setBottom(err.message, 'bad');
      } finally {
        setCredentialButtonsEnabled(true);
      }
    });

    function makeCopyHandler(inputEl, btnEl) {
      var copyTimer = null;
      return function() {
        if (!inputEl.value) return;
        clearTimeout(copyTimer);
        try {
          navigator.clipboard.writeText(inputEl.value).then(function() {
            btnEl.textContent = 'Copied!';
            copyTimer = setTimeout(function() { btnEl.textContent = 'Copy'; }, 1200);
          }).catch(function(err) {
            console.warn('Clipboard write failed:', err);
          });
        } catch (err) {
          console.warn('Clipboard write failed:', err);
        }
      };
    }
    copyIdentityEl.addEventListener('click', makeCopyHandler(loginIdentityEl, copyIdentityEl));
    copyPasswordEl.addEventListener('click', makeCopyHandler(loginPasswordEl, copyPasswordEl));

    credentialLoginEl.addEventListener('click', async function() {
      if (!supportsCredentialLogin(currentPlatform())) {
        setBottom('Choose a supported platform first.', 'bad');
        return;
      }
      try {
        await ensureCredentialsReady();
      } catch (err) {
        setBottom(err.message, 'bad');
        return;
      }
      setBottom('Submitting credentials in a visible browser...', '');
      setCredentialButtonsEnabled(false);
      try {
        var data = await api('/api/login/credentials', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            platform: currentPlatform(),
            account: currentAccount(),
            identity: loginIdentityEl.value,
            password: loginPasswordEl.value,
            useBrowserProfile: useProfileEl.checked
          })
        });
        if (data.saved) {
          activeFlowId = null;
          setLoginFlowActive(false);
          setBottom('Session saved.', 'good');
          await refreshAccounts();
          await refreshStatus();
        } else {
          activeFlowId = data.flowId;
          setLoginFlowActive(true);
          setBottom('Finish the open browser challenge, then verify and save.', 'good');
        }
      } catch (err) {
        setBottom(err.message, 'bad');
      } finally {
        setCredentialButtonsEnabled(true);
      }
    });

    finishLoginEl.addEventListener('click', async function() {
      if (!activeFlowId) return;
      var originalText = finishLoginEl.textContent;
      setBottom('Verifying session...', '');
      finishLoginEl.textContent = 'Verifying...';
      finishLoginEl.disabled = true;
      try {
        await api('/api/login/finish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ flowId: activeFlowId })
        });
        activeFlowId = null;
        setLoginFlowActive(false);
        setBottom('Session saved.', 'good');
        await refreshAccounts();
        await refreshStatus();
      } catch (err) {
        setLoginFlowActive(true);
        setBottom(err.message + ' Keep the login browser open, finish the login, then click Verify and save again.', 'bad');
      } finally {
        if (activeFlowId) {
          finishLoginEl.textContent = originalText;
          finishLoginEl.disabled = false;
        } else {
          updateLoginSessionStatus();
        }
      }
    });

    cancelLoginEl.addEventListener('click', async function() {
      if (!activeFlowId) return;
      await api('/api/login/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ flowId: activeFlowId })
      });
      activeFlowId = null;
      setLoginFlowActive(false);
      setBottom('Login canceled.', '');
    });

    document.getElementById('clearSession').addEventListener('click', async function() {
      setBottom('Clearing session...', '');
      try {
        await api('/api/session/clear', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ platform: currentPlatform(), account: currentAccount() })
        });
        setBottom('Session cleared.', 'good');
        await refreshStatus();
      } catch (err) {
        setBottom(err.message, 'bad');
      }
    });

    document.getElementById('deleteAccount').addEventListener('click', async function() {
      var accountLabel = currentAccount();
      var confirmed = window.confirm(
        'Delete account \'' + accountLabel + '\' and ALL its data (fingerprint, sessions, browser profile, credentials, block records)? This cannot be undone.'
      );
      if (!confirmed) return;
      setBottom('Deleting account...', '');
      try {
        await api('/api/account/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accountId: accountLabel })
        });
        setBottom('Account \'' + accountLabel + '\' deleted.', 'good');
        await refreshAccounts();
        setAccountInputs(knownAccounts[0] || '');
        updateAll();
        saveStateSoon();
      } catch (err) {
        setBottom(err.message, 'bad');
      }
    });

    accountEl.addEventListener('input', function() {
      accountMirrorEl.value = accountEl.value;
      updateAll();
      loadCredentialsSoon();
      saveStateSoon();
    });
    accountMirrorEl.addEventListener('input', function() {
      accountEl.value = accountMirrorEl.value;
      updateAll();
      loadCredentialsSoon();
      saveStateSoon();
    });
    accountPickerEl.addEventListener('change', function() {
      setAccountInputs(accountPickerEl.value || '');
      updateAll();
      loadCredentialsSoon();
      saveStateSoon();
      refreshAccountData();
    });
    activePlatformEl.addEventListener('change', function() {
      updateAll();
      loadCredentials().catch(handleCredentialLoadError);
      saveStateSoon();
    });
    useProfileEl.addEventListener('change', function() { updateAll(); saveStateSoon(); });
    document.getElementById('targetList').addEventListener('click', function(event) {
      var row = event.target.closest('.target-row');
      if (!row) return;
      var platform = row.dataset.platform;
      if (!platform) return;
      selectedDetailPlatform = platform;
      updateTargetSelection();
    });

    document.getElementById('overrideCaptionCheckbox').addEventListener('change', function() {
      var platform = selectedDetailPlatform;
      var input = document.getElementById('overrideCaptionInput');
      if (this.checked) {
        overrideEnabled[platform] = true;
        if (!overrideText[platform]) {
          overrideText[platform] = document.getElementById('textInput').value || '';
        }
      } else {
        overrideEnabled[platform] = false;
      }
      updateOvrBadges();
      updateOverrideSection(platform);
      updateBaseCaptionCount(document.getElementById('textInput').value || '');
      saveStateSoon();
    });

    document.getElementById('overrideCaptionInput').addEventListener('input', function() {
      var platform = selectedDetailPlatform;
      overrideText[platform] = this.value;
      updateOverrideCaptionCount(platform, this.value);
      saveStateSoon();
    });
    document.querySelectorAll('[data-file-label]').forEach(function(input) {
      input.addEventListener('change', function() { updateFileLabel(input); });
    });
    document.addEventListener('input', function(event) {
      if (event.target.matches('[data-save], #textInput')) {
        updateAll();
        saveStateSoon();
      }
    });
    document.addEventListener('change', function(event) {
      if (event.target.matches('[data-save], input[name="targets"]')) {
        updateAll();
        saveStateSoon();
      }
    });

    api('/api/state')
      .then(function(data) { applyState(data.state || {}); })
      .catch(function(err) {
        applyState({});
        setBottom('Could not load saved draft state: ' + err.message, 'bad');
      })
      .then(function() {
        return Promise.allSettled([
          refreshAccounts(),
          loadCredentials(),
          refreshStatus(),
          refreshHistory(),
          refreshQueue()
        ]);
      })
      .then(function(results) {
        if (results[2] && results[2].status === 'rejected') markStatusUnavailable();
        reportSettledFailures(results, 'Startup refresh had errors');
      });
  </script>
</body>
</html>`;

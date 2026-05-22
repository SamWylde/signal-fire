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
    .target-row[data-active="true"] {
      border-left: 3px solid var(--ember);
      background: rgba(184,92,58,.08);
    }
    .target-row input { width: 18px; height: 18px; margin: 0; accent-color: var(--ink); }
    .content-row { cursor: pointer; }
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
    .file-name { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11.5px; }
    .file-clear { position: relative; z-index: 1; margin-left: auto; flex-shrink: 0; padding: 0 5px; height: 20px; border: none; background: none; color: var(--ink-3); cursor: pointer; font-size: 14px; line-height: 1; border-radius: 4px; }
    .file-clear:hover { background: var(--surface); color: var(--ink-1); }
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
    .run-log {
      min-height: 126px;
      max-height: 220px;
      background: #151515;
      color: #f4efe4;
      border-color: #2f2c28;
    }
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
        <input id="account" class="account-input" value="" autocomplete="off" placeholder="Account label">
      </label>
      <div class="account-chip">
        <div class="avatar">M</div>
        <div style="min-width:0">
          <div id="activeBadge" class="chip-main">No account</div>
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
          <button id="checkForm" class="btn compose-action" type="button">Check form</button>
          <button id="manualVerifyTop" class="btn compose-action" type="button">Prepare 0 (manual)</button>
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
            <span>Typing <span id="typingSpeedSummary" style="font-family:var(--mono)">200%</span></span>
            <span class="rule"></span>
            <span>Word pause <span id="wordPauseSummary" style="font-family:var(--mono)">40ms</span></span>
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
                <div class="target-row content-row" data-detail-target="content">
                  <div style="width:18px;height:18px;flex-shrink:0"></div>
                  <div class="target-row-body">
                    <span class="platform-square" style="background:var(--ink-3)">&#9998;</span>
                    <span><span class="target-name">Content</span><span class="target-sub">Base content for all platforms</span></span>
                  </div>
                </div>
                <div class="target-row" data-platform="linkedin" data-detail-target="linkedin">
                  <input type="checkbox" name="targets" value="linkedin">
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#0a66c2">in</span>
                    <span><span class="target-name">LinkedIn <span class="ovr-badge" data-ovr-badge="linkedin" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="linkedin">none</span></span></span>
                  </div>
                </div>
                <div class="target-row" data-platform="x" data-detail-target="x">
                  <input type="checkbox" name="targets" value="x">
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#0a0a0a">X</span>
                    <span><span class="target-name">X <span class="ovr-badge" data-ovr-badge="x" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="x">none</span></span></span>
                  </div>
                </div>
                <div class="target-row selected" data-platform="facebook" data-detail-target="facebook">
                  <input type="checkbox" name="targets" value="facebook" checked>
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#1877f2">f</span>
                    <span><span class="target-name">Facebook <span class="mini-chip">PAGE</span> <span class="ovr-badge" data-ovr-badge="facebook" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="facebook">none</span></span></span>
                  </div>
                </div>
                <div class="target-row" data-platform="instagram" data-detail-target="instagram">
                  <input type="checkbox" name="targets" value="instagram" checked>
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#e1306c">IG</span>
                    <span><span class="target-name">Instagram <span class="ovr-badge" data-ovr-badge="instagram" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="instagram">none</span></span></span>
                  </div>
                </div>
                <div class="target-row" data-platform="tiktok" data-detail-target="tiktok">
                  <input type="checkbox" name="targets" value="tiktok">
                  <div class="target-row-body">
                    <span class="platform-square" style="background:#161823">TT</span>
                    <span><span class="target-name">TikTok <span class="ovr-badge" data-ovr-badge="tiktok" hidden>OVR</span></span><span class="target-sub"><span class="status-dot none-dot"></span><span data-session-label="tiktok">none</span></span></span>
                  </div>
                </div>
                <div class="target-row" data-platform="youtube" data-detail-target="youtube">
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
                    <div id="postingAccount" style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">No account</div>
                    <div style="color:var(--ink-3);font-size:11px">Workspace account</div>
                  </div>
                </div>
              </div>
            </section>

            <section class="pane">
              <div id="platformDetails">
                <div data-platform-detail="content">
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
                </div>

                <div data-platform-detail="linkedin" hidden>
                  <div class="card pad" style="display:grid;gap:12px">
                    <div class="eyebrow">LinkedIn overrides</div>
                    <label>TEXT / CAPTION
                      <textarea name="linkedinText" data-save="linkedinText" form="campaignForm" placeholder="Inherits from base content"></textarea>
                    </label>
                    <label>TITLE
                      <input type="text" name="linkedinBaseTitle" data-save="linkedinBaseTitle" form="campaignForm" placeholder="Inherits from base content">
                    </label>
                    <label class="file-field"><input type="file" name="linkedinImage" form="campaignForm" accept="image/*" data-file-label="linkedinImageFileName"><span>Image</span><span id="linkedinImageFileName" class="file-name">No file selected</span></label>
                    <label class="file-field"><input type="file" name="linkedinVideo" form="campaignForm" accept="video/*" data-file-label="linkedinVideoFileName"><span>Video</span><span id="linkedinVideoFileName" class="file-name">No file selected</span></label>
                    <div class="two">
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
                    <label data-linkedin-company-id-row>LinkedIn Company ID <span id="linkedinCompanyIdOptional">(optional)</span>
                      <input type="text" name="linkedinCompanyId" data-save="linkedinCompanyId" placeholder="Optional fallback; auto-detected from URL when possible">
                      <span id="linkedinCompanyIdHint" style="display:block;color:var(--ink-3);font-size:11px;margin-top:4px"></span>
                    </label>
                    <label>Post Type
                      <select name="linkedinPostType" data-save="linkedinPostType">
                        <option value="post">Post (short share)</option>
                        <option value="article">Article (long-form)</option>
                      </select>
                    </label>
                    <label data-linkedin-article-only>Article Title
                      <input type="text" name="linkedinTitle" data-save="linkedinTitle" placeholder="Article title (optional)">
                    </label>
                    <label data-linkedin-article-only>Share Intro
                      <input type="text" name="linkedinShareIntro" data-save="linkedinShareIntro" placeholder="Intro text for share modal (optional)">
                    </label>
                  </div>
                </div>

                <div data-platform-detail="x" hidden>
                  <div class="card pad" style="display:grid;gap:12px">
                    <div class="eyebrow">X overrides</div>
                    <label>TEXT / CAPTION
                      <textarea name="xText" data-save="xText" form="campaignForm" placeholder="Inherits from base content"></textarea>
                    </label>
                    <label>TITLE
                      <input type="text" name="xBaseTitle" data-save="xBaseTitle" form="campaignForm" placeholder="Inherits from base content">
                    </label>
                    <label class="file-field"><input type="file" name="xImage" form="campaignForm" accept="image/*" data-file-label="xImageFileName"><span>Image</span><span id="xImageFileName" class="file-name">No file selected</span></label>
                    <label class="file-field"><input type="file" name="xVideo" form="campaignForm" accept="video/*" data-file-label="xVideoFileName"><span>Video</span><span id="xVideoFileName" class="file-name">No file selected</span></label>
                    <div class="two">
                      <label>X Community
                        <input name="communityName" data-save="communityName">
                      </label>
                      <label>X Community ID
                        <input name="communityId" data-save="communityId">
                      </label>
                    </div>
                  </div>
                </div>

                <div data-platform-detail="facebook" hidden>
                  <div class="card pad" style="display:grid;gap:12px">
                    <div class="eyebrow">Facebook overrides</div>
                    <label>TEXT / CAPTION
                      <textarea name="facebookText" data-save="facebookText" form="campaignForm" placeholder="Inherits from base content"></textarea>
                    </label>
                    <label>TITLE
                      <input type="text" name="facebookBaseTitle" data-save="facebookBaseTitle" form="campaignForm" placeholder="Inherits from base content">
                    </label>
                    <label class="file-field"><input type="file" name="facebookImage" form="campaignForm" accept="image/*" data-file-label="facebookImageFileName"><span>Image</span><span id="facebookImageFileName" class="file-name">No file selected</span></label>
                    <label class="file-field"><input type="file" name="facebookVideo" form="campaignForm" accept="video/*" data-file-label="facebookVideoFileName"><span>Video</span><span id="facebookVideoFileName" class="file-name">No file selected</span></label>
                    <label>Facebook Page URL
                      <input name="pageUrl" data-save="pageUrl" placeholder="https://www.facebook.com/your-page">
                    </label>
                    <label>Post As
                      <select name="facebookPostAs" data-save="facebookPostAs">
                        <option value="personal" selected>Personal</option>
                        <option value="page">Page</option>
                      </select>
                    </label>
                    <label data-facebook-page-only>Facebook Page Name
                      <input type="text" name="facebookPageName" data-save="facebookPageName" placeholder="e.g. GrantCue">
                    </label>
                  </div>
                </div>

                <div data-platform-detail="instagram" hidden>
                  <div class="card pad" style="display:grid;gap:12px">
                    <div class="eyebrow">Instagram overrides</div>
                    <label>TEXT / CAPTION
                      <textarea name="instagramText" data-save="instagramText" form="campaignForm" placeholder="Inherits from base content"></textarea>
                    </label>
                    <label>TITLE
                      <input type="text" name="instagramBaseTitle" data-save="instagramBaseTitle" form="campaignForm" placeholder="Inherits from base content">
                    </label>
                    <label class="file-field"><input type="file" name="instagramImage" form="campaignForm" accept="image/*" data-file-label="instagramImageFileName"><span>Image</span><span id="instagramImageFileName" class="file-name">No file selected</span></label>
                    <label class="file-field"><input type="file" name="instagramVideo" form="campaignForm" accept="video/*" data-file-label="instagramVideoFileName"><span>Video</span><span id="instagramVideoFileName" class="file-name">No file selected</span></label>
                  </div>
                </div>

                <div data-platform-detail="tiktok" hidden>
                  <div class="card pad" style="display:grid;gap:12px">
                    <div class="eyebrow">TikTok overrides</div>
                    <label>TEXT / CAPTION
                      <textarea name="tiktokText" data-save="tiktokText" form="campaignForm" placeholder="Inherits from base content"></textarea>
                    </label>
                    <label>TITLE
                      <input type="text" name="tiktokBaseTitle" data-save="tiktokBaseTitle" form="campaignForm" placeholder="Inherits from base content">
                    </label>
                    <label class="file-field"><input type="file" name="tiktokImage" form="campaignForm" accept="image/*" data-file-label="tiktokImageFileName"><span>Image</span><span id="tiktokImageFileName" class="file-name">No file selected</span></label>
                    <label class="file-field"><input type="file" name="tiktokVideo" form="campaignForm" accept="video/*" data-file-label="tiktokVideoFileName"><span>Video</span><span id="tiktokVideoFileName" class="file-name">No file selected</span></label>
                    <div class="two">
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
                  </div>
                </div>

                <div data-platform-detail="youtube" hidden>
                  <div class="card pad" style="display:grid;gap:12px">
                    <div class="eyebrow">YouTube overrides</div>
                    <label>TEXT / CAPTION
                      <textarea name="youtubeText" data-save="youtubeText" form="campaignForm" placeholder="Inherits from base content"></textarea>
                    </label>
                    <label>TITLE
                      <input type="text" name="youtubeBaseTitle" data-save="youtubeBaseTitle" form="campaignForm" placeholder="Inherits from base content">
                    </label>
                    <label class="file-field"><input type="file" name="youtubeImage" form="campaignForm" accept="image/*" data-file-label="youtubeImageFileName"><span>Image</span><span id="youtubeImageFileName" class="file-name">No file selected</span></label>
                    <label class="file-field"><input type="file" name="youtubeVideo" form="campaignForm" accept="video/*" data-file-label="youtubeVideoFileName"><span>Video</span><span id="youtubeVideoFileName" class="file-name">No file selected</span></label>
                    <div class="two">
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
                    <label>Playlist
                      <input name="playlist" data-save="playlist">
                    </label>
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="card-head">
                  <div class="eyebrow">Live run log</div>
                  <div style="display:flex;gap:8px;align-items:center">
                    <button id="copyRunLog" class="btn" type="button">Copy logs</button>
                    <button id="clearRunLog" class="btn" type="button">Clear</button>
                  </div>
                </div>
                <div style="padding:12px">
                  <div id="runLog" class="log run-log">No run logs yet.</div>
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
                    <input id="accountMirror" value="" autocomplete="off" placeholder="Account label">
                  </label>
                </div>
                <label class="check-row"><input type="checkbox" id="useBrowserProfile" checked disabled> Persistent browser profile</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button id="startLogin" class="btn dark" type="button">Open browser login</button>
                  <button id="verifyLogin" class="btn" type="button" disabled>Verify</button>
                  <button id="saveLogin" class="btn primary" type="button" disabled>Save session</button>
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
                      <input id="loginPassword" type="text" autocomplete="current-password" style="flex:1;min-width:0">
                      <button id="copyPassword" class="btn" type="button" style="padding:4px 8px;font-size:0.8em;white-space:nowrap">Copy</button>
                    </div>
                  </label>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <button id="saveCredentials" class="btn" type="button">Save credentials</button>
                  <button id="credentialLogin" class="btn primary" type="button">Login with saved credentials</button>
                  <button id="forgetCredentials" class="btn danger" type="button">Forget saved</button>
                  <span class="meta-line" id="credentialState">No saved credentials.</span>
                  <span class="meta-line">If a checkpoint opens, finish it and save the session.</span>
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
                    <small style="display:block;margin-top:4px;color:#7a6a55;font-weight:400;font-size:11px;line-height:1.35">Shortest random wait before posting to the next platform in a campaign.</small>
                  </label>
                  <label>Delay max seconds
                    <input name="campaignDelayMaxSeconds" data-save="campaignDelayMaxSeconds" inputmode="numeric" form="campaignForm">
                    <small style="display:block;margin-top:4px;color:#7a6a55;font-weight:400;font-size:11px;line-height:1.35">Longest random wait before posting to the next platform in a campaign.</small>
                  </label>
                </div>
                <div class="two">
                  <label>Post cap / hour
                    <input name="postLimitPerHour" data-save="postLimitPerHour" inputmode="numeric" form="campaignForm">
                    <small style="display:block;margin-top:4px;color:#7a6a55;font-weight:400;font-size:11px;line-height:1.35">Max successful posts per account in any rolling 1-hour window.</small>
                  </label>
                  <label>Post cap / day
                    <input name="postLimitPerDay" data-save="postLimitPerDay" inputmode="numeric" form="campaignForm">
                    <small style="display:block;margin-top:4px;color:#7a6a55;font-weight:400;font-size:11px;line-height:1.35">Max successful posts per account in any rolling 24-hour window.</small>
                  </label>
                </div>
                <div><div class="eyebrow" style="font-size:10px;margin-bottom:2px">TikTok interactions</div><small style="display:block;color:#7a6a55;font-size:11px;line-height:1.35;margin-bottom:6px">Toggle what viewers can do with your TikTok video.</small></div>
                <div class="three">
                  <label class="check-row"><input type="checkbox" name="allowComments" data-save="allowComments" form="campaignForm" checked> Comments</label>
                  <label class="check-row"><input type="checkbox" name="allowDuet" data-save="allowDuet" form="campaignForm" checked> Duet</label>
                  <label class="check-row"><input type="checkbox" name="allowStitch" data-save="allowStitch" form="campaignForm" checked> Stitch</label>
                </div>
                <label class="check-row"><input type="checkbox" name="madeForKids" data-save="madeForKids" form="campaignForm"> Made for kids <small style="display:block;color:#7a6a55;font-weight:400;font-size:11px;line-height:1.35;margin-top:2px">YouTube COPPA setting — leave OFF unless content is directed at children. When ON, YouTube disables comments, personalized ads, and end screens.</small></label>
              </div>
            </div>
            <div class="card">
              <div class="card-head"><div class="eyebrow">Browser runtime</div></div>
              <div style="padding:14px;display:grid;gap:12px">
                <label>Slow motion ms
                  <input name="slowMoMs" data-save="slowMoMs" inputmode="numeric" form="campaignForm">
                  <small style="display:block;margin-top:4px;color:#7a6a55;font-weight:400;font-size:11px;line-height:1.35">Pause inserted between non-typing browser actions (clicks, mouse moves, navigation). Higher values look more cautious; lower values are faster but more bot-like. Does not affect typing speed.</small>
                </label>
                <label>Typing speed <span id="typingSpeedValue" class="meta-line">200%</span>
                  <input type="range" name="typingSpeedPercent" data-save="typingSpeedPercent" min="50" max="1000" step="25" value="200" form="campaignForm">
                  <small style="display:block;margin-top:4px;color:#7a6a55;font-weight:400;font-size:11px;line-height:1.35">How fast simulated human typing runs. 100% is a slow deliberate human; 1000% is hurried. Affects per-character keystroke timing on all platforms.</small>
                </label>
                <label>Word pause <span id="wordPauseValue" class="meta-line">40ms</span>
                  <input type="range" name="wordPauseMaxMs" data-save="wordPauseMaxMs" min="0" max="200" step="5" value="40" form="campaignForm">
                  <small style="display:block;margin-top:4px;color:#7a6a55;font-weight:400;font-size:11px;line-height:1.35">Maximum gap between words during typing, in milliseconds. The actual gap varies between 30% and 100% of this value. Set to 0 for tight back-to-back words.</small>
                </label>
                <input type="hidden" name="spoofFingerprint" value="false" form="campaignForm">
                <label class="check-row"><input type="checkbox" id="spoofFingerprint" name="spoofFingerprint" value="true" data-save="spoofFingerprint" form="campaignForm"> Spoof browser fingerprint (stealth mode)</label>
                <div class="meta-line">Leave off to use this computer's real browser identity. Toggling may force a one-time re-login for accounts first saved in the other mode.</div>
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
    var activeFlowId = null;
    var saveTimer = null;
    var selectedDetailPlatform = 'content';
    var credentialLoadTimer = null;
    var activeFlowLookupTimer = null;
    var latestResults = [];
    var latestStatusRows = [];
    var queuedEntries = [];
    var historyEntries = [];
    var runLogEntries = [];
    var runLogTimer = null;
    var draftFiles = {};
    var draftUploadRequests = {};
    // Per-platform fields the user has explicitly edited. These stop mirroring the base.
    var platformFieldEdited = {};
    var activeView = 'compose';
    var accountEl = document.getElementById('account');
    var accountMirrorEl = document.getElementById('accountMirror');
    var accountPickerEl = document.getElementById('accountPicker');
    var activePlatformEl = document.getElementById('activePlatform');
    var useProfileEl = document.getElementById('useBrowserProfile');
    var spoofFingerprintEl = document.getElementById('spoofFingerprint');
    var formEl = document.getElementById('campaignForm');
    var verifyLoginEl = document.getElementById('verifyLogin');
    var saveLoginEl = document.getElementById('saveLogin');
    var cancelLoginEl = document.getElementById('cancelLogin');
    var credentialLoginEl = document.getElementById('credentialLogin');
    var saveCredentialsEl = document.getElementById('saveCredentials');
    var forgetCredentialsEl = document.getElementById('forgetCredentials');
    var credentialStateEl = document.getElementById('credentialState');
    var loginIdentityEl = document.getElementById('loginIdentity');
    var loginPasswordEl = document.getElementById('loginPassword');
    var copyIdentityEl = document.getElementById('copyIdentity');
    var copyPasswordEl = document.getElementById('copyPassword');
    var knownAccounts = [];

    function showPasswordField() {
      if (loginPasswordEl.type !== 'text') loginPasswordEl.type = 'text';
    }
    showPasswordField();

    function normalizedAccount(value) {
      return (value || '').replace(/\s+/g, ' ').trim();
    }

    function currentAccount() {
      return normalizedAccount(accountEl.value || accountMirrorEl.value);
    }

    function displayAccount() {
      return currentAccount() || 'No account';
    }
    function currentPlatform() { return activePlatformEl.value; }
    function currentSpoofFingerprint() { return spoofFingerprintEl.checked; }
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
      var savedAccounts = (accounts || []).filter(function(account, index, list) {
        return account && list.indexOf(account) === index;
      });
      knownAccounts = savedAccounts.slice();
      var account = currentAccount();
      if (account.length > 0 && knownAccounts.indexOf(account) === -1) knownAccounts.push(account);
      accountPickerEl.replaceChildren();
      if (knownAccounts.length === 0) {
        var emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'No saved accounts';
        accountPickerEl.appendChild(emptyOption);
      }
      knownAccounts.forEach(function(accountName) {
        var option = document.createElement('option');
        option.value = accountName;
        option.textContent = accountName;
        accountPickerEl.appendChild(option);
      });
      var deleteBtn = document.getElementById('deleteAccount');
      if (deleteBtn) {
        var savedMatch = savedAccounts.indexOf(account) !== -1;
        var isLast = savedAccounts.length <= 1;
        deleteBtn.disabled = account.length === 0 || !savedMatch || isLast;
        deleteBtn.title = account.length === 0
          ? 'Choose a saved account to delete'
          : !savedMatch
            ? 'Save this account before it can be deleted'
            : isLast
              ? 'Cannot delete the last remaining account'
              : '';
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
      var supported = enabled && supportsCredentialLogin(currentPlatform()) && currentAccount().length > 0;
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
      if (currentAccount().length === 0) {
        loginIdentityEl.value = '';
        loginPasswordEl.value = '';
        setCredentialState('Choose an account to use saved credentials.');
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
      showPasswordField();
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
        draftFiles: draftFiles,
        platformFieldEdited: platformFieldEdited
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
      if (Object.prototype.hasOwnProperty.call(state, 'account')) {
        setAccountInputs(state.account || '');
      }
      if (state.activePlatform) activePlatformEl.value = state.activePlatform;
      if (Array.isArray(state.targets)) {
        formEl.querySelectorAll('input[name="targets"]').forEach(function(input) {
          input.checked = state.targets.indexOf(input.value) !== -1;
        });
        if (state.targets.length > 0) selectedDetailPlatform = state.targets[0];
      }
      if (state.draftFiles && typeof state.draftFiles === 'object') draftFiles = state.draftFiles;
      platformFieldEdited = state && state.platformFieldEdited && typeof state.platformFieldEdited === 'object'
        ? state.platformFieldEdited
        : {};
      if (state.fields) {
        if ('useBrowserProfile' in state.fields) useProfileEl.checked = true; // legacy state may have false; checkbox is disabled and feature is always-on
        document.querySelectorAll('[data-save]').forEach(function(input) {
          var key = input.dataset.save;
          if (!(key in state.fields)) return;
          if (input.type === 'checkbox') input.checked = state.fields[key] === true;
          else input.value = state.fields[key] || '';
        });
      }
      document.querySelectorAll('[data-file-label]').forEach(function(input) {
        updateFileLabel(input);
      });
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
        refreshQueue(),
        refreshRunLogs()
      ]);
      if (results[0] && results[0].status === 'rejected') markStatusUnavailable();
      reportSettledFailures(results, 'Could not refresh account data');
    }

    function updateAll() {
      var account = currentAccount();
      if (document.activeElement !== accountMirrorEl) accountMirrorEl.value = account;
      if (document.activeElement !== accountEl) accountEl.value = account;
      document.getElementById('activeBadge').textContent = displayAccount();
      document.getElementById('postingAccount').textContent = displayAccount();
      document.getElementById('loginPlatformBadge').textContent = platformNames[currentPlatform()];
      syncAccountPicker();
      setCredentialButtonsEnabled(true);
      var targets = selectedTargets();
      document.getElementById('targetCount').textContent = targets.length + ' of 6';
      document.getElementById('manualVerifyTop').textContent = 'Prepare ' + targets.length + ' (manual)';
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
      updateTypingSpeedLabels();
      document.getElementById('browserSummary').textContent = useProfileEl.checked ? 'persistent profile' : 'storage state';
      updateLoginSessionStatus();
      updatePreview();
      updateTargetSelection();
      updateSchedulePreview();
    }

    function updateTypingSpeedLabels() {
      var input = document.querySelector('[name="typingSpeedPercent"]');
      var value = input && input.value ? input.value : '200';
      document.getElementById('typingSpeedValue').textContent = value + '%';
      document.getElementById('typingSpeedSummary').textContent = value + '%';
      var pauseInput = document.querySelector('[name="wordPauseMaxMs"]');
      var pauseValue = pauseInput && pauseInput.value ? pauseInput.value : '40';
      document.getElementById('wordPauseValue').textContent = pauseValue + 'ms';
      document.getElementById('wordPauseSummary').textContent = pauseValue + 'ms';
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

    function linkedinCompanySlugFromUrl(value) {
      var raw = String(value || '').trim();
      if (!raw) return '';
      var path = raw;
      try {
        path = new URL(raw).pathname;
      } catch (err) {
        var marker = 'linkedin.com/company/';
        var lower = raw.toLowerCase();
        var markerIndex = lower.indexOf(marker);
        if (markerIndex === -1) return '';
        path = '/company/' + raw.slice(markerIndex + marker.length);
      }
      var parts = path.split('/').filter(Boolean);
      var companyIndex = parts
        .map(function(part) { return part.toLowerCase(); })
        .indexOf('company');
      return companyIndex !== -1 && parts[companyIndex + 1]
        ? decodeURIComponent(parts[companyIndex + 1])
        : '';
    }

    function updateLinkedInCompanyIdField() {
      var targetEl = document.querySelector('[name="linkedinTarget"]');
      var postTypeEl = document.querySelector('[name="linkedinPostType"]');
      var urlEl = document.querySelector('[name="linkedinCompanyPageUrl"]');
      var row = document.querySelector('[data-linkedin-company-id-row]');
      var hint = document.getElementById('linkedinCompanyIdHint');
      var optional = document.getElementById('linkedinCompanyIdOptional');
      if (!targetEl || !postTypeEl || !urlEl || !row || !hint || !optional) return;

      var slug = linkedinCompanySlugFromUrl(urlEl.value.trim());
      var hasUrlCompany = slug.length > 0;
      var numeric = /^\\d+$/.test(slug);
      var needsArticleId = targetEl.value === 'company' && postTypeEl.value === 'article' && !numeric;
      row.hidden = targetEl.value !== 'company' || (hasUrlCompany && !needsArticleId);
      optional.textContent = needsArticleId ? '(required for article if URL uses a slug)' : '(optional fallback)';
      hint.textContent = hasUrlCompany
        ? 'Detected from URL: ' + slug
        : 'Use this only if the company URL is unavailable.';
    }

    function updateFacebookPageFields() {
      var postAsEl = document.querySelector('[name="facebookPostAs"]');
      var isPage = postAsEl && postAsEl.value === 'page';
      var isFacebookSelected = selectedDetailPlatform === 'facebook';
      document.querySelectorAll('[data-facebook-page-only]').forEach(function(el) {
        el.hidden = !isPage || !isFacebookSelected;
      });
    }

    function updateTargetSelection() {
      var selected = selectedDetailPlatform;
      document.querySelectorAll('.target-row').forEach(function(row) {
        row.classList.toggle('selected', row.dataset.platform === selected);
        row.dataset.active = row.dataset.detailTarget === selected ? 'true' : 'false';
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
      updateLinkedInArticleFields();
      updateLinkedInCompanyIdField();
      updateFacebookPageFields();
    }

    function updateFileLabel(input) {
      var id = input.dataset.fileLabel;
      if (!id) return;
      var label = document.getElementById(id);
      if (!label) return;

      if (input.files && input.files.length) {
        label.textContent = input.files[0].name;
      } else {
        var draft = draftFiles[input.name];
        if (draft && draft.name) {
          label.textContent = draft.name + ' (saved)';
        } else {
          var baseKey = null;
          var n = input.name || '';
          if (n !== 'image' && /Image$/.test(n)) baseKey = 'image';
          else if (n !== 'video' && /Video$/.test(n)) baseKey = 'video';
          var baseDraft = baseKey ? draftFiles[baseKey] : null;
          if (baseDraft && baseDraft.name) {
            var platformName = n.replace(/Image$|Video$/, '');
            var variants = baseDraft.platformVariants;
            var hasVariant = variants && variants[platformName] && variants[platformName].path;
            if (hasVariant && baseKey === 'image') {
              label.textContent = baseDraft.name + ' (auto-fit for ' + platformName + ')';
            } else {
              label.textContent = baseDraft.name + ' (from base)';
            }
          } else {
            label.textContent = 'No file selected';
          }
        }
      }
      var hasSaved = !!(draft && draft.name);
      var clearBtn = input.closest('.file-field') && input.closest('.file-field').querySelector('.file-clear');
      if (clearBtn) clearBtn.hidden = !hasSaved;
      if (input.name === 'image' && input.files && input.files[0]) {
        var url = URL.createObjectURL(input.files[0]);
        ['facebookMediaPreview', 'instagramMediaPreview'].forEach(function(previewId) {
          var box = document.getElementById(previewId);
          box.textContent = '';
          box.innerHTML = '<img alt="">';
          box.querySelector('img').src = url;
        });
      } else if (input.name === 'image' && draft && draft.path) {
        ['facebookMediaPreview', 'instagramMediaPreview'].forEach(function(previewId) {
          var box = document.getElementById(previewId);
          box.textContent = '';
          box.innerHTML = '<img alt="">';
          box.querySelector('img').src = '/api/draft-file?path=' + encodeURIComponent(draft.path);
        });
      }
    }

    async function persistDraftFile(input) {
      if (!input.files || !input.files[0]) {
        delete draftFiles[input.name];
        updateFileLabel(input);
        saveStateSoon();
        return;
      }
      var requestId = Date.now() + ':' + Math.random();
      draftUploadRequests[input.name] = requestId;
      var form = new FormData();
      form.set('kind', input.name);
      form.set('file', input.files[0]);
      var data = await api('/api/draft-file', { method: 'POST', body: form });
      if (draftUploadRequests[input.name] !== requestId) return;
      draftFiles[input.name] = data.file;
      updateFileLabel(input);
      saveStateSoon();
    }

    async function clearDraftFile(inputName) {
      var draft = draftFiles[inputName];
      if (!draft) return;
      var qs = '?path=' + encodeURIComponent(draft.path);
      if (draft.platformVariants) {
        Object.values(draft.platformVariants).forEach(function(v) {
          qs += '&variant=' + encodeURIComponent(v.path);
        });
      }
      try {
        await api('/api/draft-file' + qs, { method: 'DELETE' });
      } catch (err) {
        setBottom('Could not remove draft file: ' + err.message, 'bad');
        return;
      }
      delete draftFiles[inputName];
      if (inputName === 'image') {
        ['facebookMediaPreview', 'instagramMediaPreview'].forEach(function(previewId) {
          var box = document.getElementById(previewId);
          if (!box) return;
          var img = box.querySelector('img');
          if (img && img.src && img.src.indexOf('blob:') === 0) {
            URL.revokeObjectURL(img.src);
          }
          box.textContent = 'Signal Fire';
        });
      }
      var input = document.querySelector('[data-file-label][name="' + inputName + '"]');
      if (input) {
        input.value = '';
        updateFileLabel(input);
        if (inputName === 'image' || inputName === 'video') {
          document.querySelectorAll('[data-file-label]').forEach(function(other) {
            if (other !== input) updateFileLabel(other);
          });
        }
      }
      saveStateSoon();
    }

    function updateBaseCaptionCount(text) {
      var countEl = document.getElementById('baseCaptionCount');
      if (!countEl) return;
      var targets = selectedTargets();
      if (targets.length === 0) {
        countEl.textContent = '';
        countEl.className = 'caption-count';
        return;
      }
      var limits = targets.map(function(p) { return CAPTION_LIMITS[p] || Infinity; });
      var minLimit = Math.min.apply(null, limits);
      var len = (text || '').length;
      countEl.textContent = len + ' / ' + minLimit;
      countEl.className = 'caption-count' + (len > minLimit ? ' over' : '');
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

    function formatRunLogTime(value) {
      var date = new Date(value);
      return Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString();
    }

    function runLogLine(entry) {
      var pieces = [
        '[' + formatRunLogTime(entry.at) + ']',
        (entry.level || 'info').toUpperCase(),
        (entry.scope || 'run').toUpperCase()
      ];
      if (entry.platform) pieces.push(platformNames[entry.platform] || entry.platform);
      var line = pieces.join(' ') + ' - ' + (entry.message || '');
      if (entry.detail) line += ' - ' + entry.detail;
      return line;
    }

    function renderRunLogs(entries) {
      runLogEntries = entries || [];
      var el = document.getElementById('runLog');
      if (runLogEntries.length === 0) {
        el.textContent = 'No run logs yet.';
        return;
      }
      el.textContent = runLogEntries.slice().reverse().map(runLogLine).join('\n');
      el.scrollTop = el.scrollHeight;
    }

    async function refreshRunLogs() {
      var account = currentAccount();
      var suffix = account ? '?account=' + encodeURIComponent(account) : '';
      var data = await api('/api/logs' + suffix);
      renderRunLogs(data.entries || []);
    }

    function startRunLogPolling() {
      window.clearInterval(runLogTimer);
      refreshRunLogs().catch(function(err) { console.warn('Could not refresh run logs:', err); });
      runLogTimer = window.setInterval(function() {
        refreshRunLogs().catch(function(err) { console.warn('Could not refresh run logs:', err); });
      }, 1500);
    }

    function stopRunLogPolling() {
      window.clearInterval(runLogTimer);
      runLogTimer = null;
      refreshRunLogs().catch(function(err) { console.warn('Could not refresh run logs:', err); });
    }

    function updateLoginSessionStatus() {
      var badge = document.getElementById('loginSessionBadge');
      var detail = document.getElementById('loginSessionDetail');
      var account = currentAccount();
      var row = latestStatusRows.find(function(item) {
        return item.platform === currentPlatform() && item.account === account;
      });
      var session = row ? row.session : 'none';
      badge.className = 'pill ' + session;

      if (account.length === 0) {
        badge.textContent = 'Not verified';
        detail.textContent = 'Choose an account to check saved verification.';
      } else if (session === 'fresh') {
        badge.textContent = 'Verified';
        detail.textContent = 'Verified for ' + platformNames[currentPlatform()] + ' / ' + account + (row.lastValidated ? ' at ' + formatDateTime(row.lastValidated) + '.' : '.');
      } else if (session === 'stale') {
        badge.textContent = 'Needs recheck';
        detail.textContent = 'Saved session exists, but it is stale. If the browser is logged in, click Verify to trust it again.';
      } else {
        badge.textContent = 'Not verified';
        detail.textContent = 'No saved verification for ' + platformNames[currentPlatform()] + ' / ' + account + '.';
      }

      verifyLoginEl.disabled = account.length === 0;
      saveLoginEl.disabled = !activeFlowId;
    }

    function resultLabel(result) {
      if (result.status) return result.status;
      return result.ok ? 'posted' : 'failed';
    }

    function resultTone(result) {
      var label = resultLabel(result);
      if (label === 'posted') return 'ok';
      if (label === 'queued' || label === 'posting' || label === 'prepared') return 'warn';
      if (label === 'skipped' || label === 'canceled') return 'none';
      return result.ok ? 'ok' : 'bad';
    }

    function resultDetail(result) {
      if (resultLabel(result) === 'prepared' && !result.detail) {
        return 'Form filled - submit manually in browser tab';
      }
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
        verifyLoginEl.textContent = 'Verify';
        saveLoginEl.textContent = 'Save session';
        saveLoginEl.disabled = false;
      }
      verifyLoginEl.disabled = currentAccount().length === 0;
      cancelLoginEl.disabled = !active;
      if (!active) updateLoginSessionStatus();
    }

    async function recoverActiveLoginFlow() {
      if (activeFlowId || currentAccount().length === 0) return false;
      var data = await api(
        '/api/login/active?platform=' + encodeURIComponent(currentPlatform()) +
        '&account=' + encodeURIComponent(currentAccount())
      );
      if (!data.flowId) return false;
      activeFlowId = data.flowId;
      setLoginFlowActive(true);
      setBottom('Reconnected to the open login browser.', 'good');
      return true;
    }

    function recoverActiveLoginFlowSoon() {
      clearTimeout(activeFlowLookupTimer);
      activeFlowLookupTimer = setTimeout(function() {
        recoverActiveLoginFlow().catch(function(err) {
          console.warn('Could not recover active login flow:', err);
        });
      }, 250);
    }

    function buildCampaignForm() {
      var form = new FormData(formEl);
      form.set('account', currentAccount());
      if (useProfileEl.checked) form.set('useBrowserProfile', 'on');
      Object.keys(draftFiles).forEach(function(key) {
        var file = draftFiles[key];
        if (!file || !file.path) return;
        var fieldName = 'saved' + key.charAt(0).toUpperCase() + key.slice(1) + 'Path';
        form.set(fieldName, file.path);
      });
      var baseImage = draftFiles.image;
      if (baseImage && baseImage.platformVariants && typeof baseImage.platformVariants === 'object') {
        Object.keys(baseImage.platformVariants).forEach(function(platform) {
          var v = baseImage.platformVariants[platform];
          if (v && v.path) {
            form.set('savedImageAuto' + platform.charAt(0).toUpperCase() + platform.slice(1) + 'Path', v.path);
          }
        });
      }
      return form;
    }

    function setComposeActionBusy(busy) {
      document.getElementById('postSelectedTop').disabled = busy;
      document.getElementById('manualVerifyTop').disabled = busy;
      document.getElementById('checkForm').disabled = busy;
    }

    function selectedTargetNames(targets) {
      return targets.map(function(platform) { return platformNames[platform] || platform; }).join(', ');
    }

    function fileSelected(name) {
      var input = document.querySelector('[name="' + name + '"]');
      return Boolean((input && input.value) || (draftFiles[name] && draftFiles[name].path));
    }

    function checkComposeForm() {
      var errors = [];
      var targets = selectedTargets();
      var text = document.getElementById('textInput').value.trim();
      if (currentAccount().length === 0) errors.push('Choose an account.');
      if (targets.length === 0) errors.push('Choose at least one target.');
      if (
        !text &&
        targets.some(function(platform) {
          return platform === 'x' || platform === 'facebook' || platform === 'linkedin';
        })
      ) {
        errors.push('Add post text for X, Facebook, or LinkedIn.');
      }
      if (targets.indexOf('facebook') !== -1 && !document.querySelector('[name="pageUrl"]').value.trim()) {
        errors.push('Add a Facebook page/profile URL.');
      }
      if (
        targets.indexOf('linkedin') !== -1 &&
        document.querySelector('[name="linkedinTarget"]').value === 'company' &&
        !document.querySelector('[name="linkedinCompanyPageUrl"]').value.trim() &&
        !document.querySelector('[name="linkedinCompanyId"]').value.trim()
      ) {
        errors.push('Add a LinkedIn company page URL or company ID.');
      }
      if (targets.indexOf('instagram') !== -1 && !fileSelected('image')) {
        errors.push('Choose an image for Instagram.');
      }
      if ((targets.indexOf('tiktok') !== -1 || targets.indexOf('youtube') !== -1) && !fileSelected('video')) {
        errors.push('Choose a video for TikTok or YouTube.');
      }

      if (errors.length > 0) {
        var message = errors.join(' ');
        showToast('Check form', message, 'bad');
        setBottom(message, 'bad');
        return false;
      }

      showToast('Check form', 'Required fields are present for ' + selectedTargetNames(targets) + '.', 'good');
      setBottom('Required fields are present.', 'good');
      return true;
    }

    function checkManualVerifyForm() {
      var targets = selectedTargets();
      var unsupported = targets.filter(function(platform) {
        return ['linkedin', 'x', 'facebook', 'instagram'].indexOf(platform) === -1;
      });
      if (unsupported.length > 0) {
        setBottom('Manual prepare supports LinkedIn, X, Facebook, and Instagram. Remove: ' + selectedTargetNames(unsupported), 'bad');
        return false;
      }
      return checkComposeForm();
    }

    async function runCampaign() {
      if (!checkComposeForm()) return;
      var targets = selectedTargets();
      var confirmed = window.confirm(
        'This will publish live to ' + targets.length + ' selected platform' + (targets.length === 1 ? '' : 's') + '. Use Prepare ' + targets.length + ' (manual) for review-only testing. Continue?'
      );
      if (!confirmed) return;
      setBottom('Posting selected platforms sequentially...', '');
      setComposeActionBusy(true);
      var form = buildCampaignForm();
      startRunLogPolling();
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
        setComposeActionBusy(false);
        stopRunLogPolling();
      }
    }

    async function runManualVerify() {
      if (!checkManualVerifyForm()) return;
      setBottom('Preparing selected platforms for manual submit...', '');
      setComposeActionBusy(true);
      var form = buildCampaignForm();
      startRunLogPolling();
      try {
        await saveStateNow();
        var result = await api('/api/campaign/manual', { method: 'POST', body: form });
        renderResults(result.results);
        setBottom(
          result.campaignOk ? 'Manual preparation finished. Submit manually in the open browser tabs.' : 'Manual preparation finished with failures.',
          result.campaignOk ? 'good' : 'bad'
        );
        await refreshHistory();
        await refreshStatus();
      } catch (err) {
        setBottom(err.message, 'bad');
      } finally {
        setComposeActionBusy(false);
        stopRunLogPolling();
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
      var form = buildCampaignForm();
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
    document.getElementById('manualVerifyTop').addEventListener('click', runManualVerify);
    document.getElementById('checkForm').addEventListener('click', checkComposeForm);
    document.getElementById('copyRunLog').addEventListener('click', function() {
      var button = document.getElementById('copyRunLog');
      var text = JSON.stringify(runLogEntries.slice().reverse(), null, 2);
      if (!text) return;
      try {
        navigator.clipboard.writeText(text).then(function() {
          button.textContent = 'Copied JSON';
          setTimeout(function() { button.textContent = 'Copy logs'; }, 1200);
        }).catch(function(err) {
          console.warn('Clipboard write failed:', err);
          setBottom('Could not copy logs to clipboard.', 'bad');
        });
      } catch (err) {
        console.warn('Clipboard write failed:', err);
        setBottom('Could not copy logs to clipboard.', 'bad');
      }
    });
    document.getElementById('clearRunLog').addEventListener('click', async function() {
      if (!window.confirm('Clear all run logs? This cannot be undone.')) return;
      try {
        await api('/api/logs/clear', { method: 'POST' });
        renderRunLogs([]);
        setBottom('Run logs cleared.', 'good');
      } catch (err) {
        setBottom(err.message, 'bad');
      }
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
      if (currentAccount().length === 0) {
        setBottom('Choose an account before opening browser login.', 'bad');
        return;
      }
      setBottom('Opening login browser...', '');
      try {
        var data = await api('/api/login/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            platform: currentPlatform(),
            account: currentAccount(),
            useBrowserProfile: useProfileEl.checked,
            spoofFingerprint: currentSpoofFingerprint()
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
            useBrowserProfile: useProfileEl.checked,
            spoofFingerprint: currentSpoofFingerprint()
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
          setBottom('Finish the open browser challenge, then click Save session. Verify can also mark the selected account as trusted.', 'good');
        }
      } catch (err) {
        setBottom(err.message, 'bad');
      } finally {
        setCredentialButtonsEnabled(true);
      }
    });

    verifyLoginEl.addEventListener('click', async function() {
      if (currentAccount().length === 0) {
        setBottom('Choose an account before verifying.', 'bad');
        return;
      }
      setBottom('Marking selected account as verified...', '');
      verifyLoginEl.textContent = 'Verifying...';
      verifyLoginEl.disabled = true;
      try {
        await api('/api/session/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ platform: currentPlatform(), account: currentAccount() })
        });
        setBottom('Session verified for ' + platformNames[currentPlatform()] + ' / ' + currentAccount() + '.', 'good');
        await refreshAccounts();
        await refreshStatus();
      } catch (err) {
        setBottom(err.message, 'bad');
      } finally {
        verifyLoginEl.textContent = 'Verify';
        verifyLoginEl.disabled = currentAccount().length === 0;
      }
    });

    saveLoginEl.addEventListener('click', async function() {
      if (!activeFlowId) return;
      setBottom('Saving session...', '');
      saveLoginEl.textContent = 'Saving...';
      saveLoginEl.disabled = true;
      try {
        await api('/api/login/save', {
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
        setBottom(err.message, 'bad');
      } finally {
        if (activeFlowId) {
          saveLoginEl.textContent = 'Save session';
          saveLoginEl.disabled = false;
          verifyLoginEl.disabled = currentAccount().length === 0;
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
      if (currentAccount().length === 0) {
        setBottom('Choose an account before clearing a session.', 'bad');
        return;
      }
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
      if (accountLabel.length === 0) {
        setBottom('Choose a saved account to delete.', 'bad');
        return;
      }
      var confirmed = window.confirm(
        'Delete account \'' + accountLabel + '\' and ALL its data (fingerprint, sessions, browser profile, credentials, block records, history, queue)? This cannot be undone.'
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
        knownAccounts = knownAccounts.filter(function(account) {
          return normalizedAccount(account) !== accountLabel;
        });
        setAccountInputs(knownAccounts[0] || '');
        await refreshAccounts();
        if (currentAccount().length === 0 && knownAccounts.length > 0) {
          setAccountInputs(knownAccounts[0]);
        }
        updateAll();
        await saveStateNow();
        await refreshAccountData();
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
      if (event.target.closest('input[type="checkbox"]')) return;
      var row = event.target.closest('[data-detail-target]');
      if (!row) return;
      var target = row.dataset.detailTarget;
      if (!target) return;
      selectedDetailPlatform = target;
      updateTargetSelection();
      if (target !== 'content') syncBaseToPlatforms();
    });

    function syncBaseToPlatforms() {
      var baseTextEl = document.getElementById('textInput');
      var baseText = baseTextEl ? baseTextEl.value : '';
      var baseTitleEl = document.querySelector('[name="title"]');
      var baseTitle = baseTitleEl ? baseTitleEl.value : '';
      var platforms = ['linkedin', 'x', 'facebook', 'instagram', 'tiktok', 'youtube'];
      platforms.forEach(function(platform) {
        var textKey = platform + 'Text';
        var titleKey = platform + 'BaseTitle';
        var textEl = document.querySelector('[name="' + textKey + '"]');
        var titleEl = document.querySelector('[name="' + titleKey + '"]');
        if (textEl && !platformFieldEdited[textKey] && textEl.value !== baseText) {
          textEl.value = baseText;
        }
        if (titleEl && !platformFieldEdited[titleKey] && titleEl.value !== baseTitle) {
          titleEl.value = baseTitle;
        }
      });
    }

    ['linkedin', 'x', 'facebook', 'instagram', 'tiktok', 'youtube'].forEach(function(platform) {
      var textEl = document.querySelector('[name="' + platform + 'Text"]');
      var titleEl = document.querySelector('[name="' + platform + 'BaseTitle"]');
      if (textEl) {
        textEl.addEventListener('input', function(event) {
          if (event.isTrusted) {
            platformFieldEdited[platform + 'Text'] = true;
            saveStateSoon();
          }
        });
      }
      if (titleEl) {
        titleEl.addEventListener('input', function(event) {
          if (event.isTrusted) {
            platformFieldEdited[platform + 'BaseTitle'] = true;
            saveStateSoon();
          }
        });
      }
    });

    document.querySelectorAll('[data-file-label]').forEach(function(input) {
      var fieldLabel = input.closest('.file-field');
      if (fieldLabel) {
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'file-clear';
        clearBtn.textContent = '×';
        clearBtn.hidden = true;
        clearBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          clearDraftFile(input.name).catch(function() {});
        });
        fieldLabel.appendChild(clearBtn);
      }
    });

    document.querySelectorAll('[data-file-label]').forEach(function(input) {
      input.addEventListener('change', function() {
        updateFileLabel(input);
        persistDraftFile(input).then(function() {
          if (input.name === 'image' || input.name === 'video') {
            document.querySelectorAll('[data-file-label]').forEach(function(other) {
              if (other !== input) updateFileLabel(other);
            });
          }
        }).catch(function(err) {
          setBottom('Could not save selected file for reopening: ' + err.message, 'bad');
        });
      });
    });
    document.addEventListener('input', function(event) {
      if (event.target.matches('[data-save], #textInput')) {
        updateAll();
        saveStateSoon();
      }
      if (event.target.matches('#textInput, [name="title"]')) {
        syncBaseToPlatforms();
      }
    });
    document.addEventListener('change', function(event) {
      if (event.target.matches('[data-save], input[name="targets"]')) {
        updateAll();
        saveStateSoon();
      }
    });

    api('/api/state')
      .then(function(data) { applyState(data.state || {}); syncBaseToPlatforms(); })
      .catch(function(err) {
        applyState({});
        syncBaseToPlatforms();
        setBottom('Could not load saved draft state: ' + err.message, 'bad');
      })
      .then(function() {
        return Promise.allSettled([
          refreshAccounts(),
          loadCredentials(),
          refreshStatus(),
          refreshHistory(),
          refreshQueue(),
          refreshRunLogs()
        ]);
      })
      .then(function(results) {
        if (results[2] && results[2].status === 'rejected') markStatusUnavailable();
        reportSettledFailures(results, 'Startup refresh had errors');
      });
  </script>
</body>
</html>`;

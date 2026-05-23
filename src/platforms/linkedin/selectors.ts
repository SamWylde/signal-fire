export const LINKEDIN = {
  urls: {
    home: 'https://www.linkedin.com/feed/',
    login: 'https://www.linkedin.com/login',
    checkpoint: 'https://www.linkedin.com/checkpoint', // 2FA / email verify URL prefix
  },
  timeouts: {
    shortMs: 5_000,
    mediumMs: 10_000,
    longMs: 30_000,
    // LinkedIn often shows a multi-step verify flow; allow generous wait for user-driven 2FA
    checkpointMs: 120_000,
  },
  selectors: {
    login: {
      email:
        "#username:visible, input[autocomplete='username']:visible, input[type='email']:visible",
      password:
        "#password:visible, input[autocomplete='current-password']:visible, input[type='password']:visible",
      // Source uses '.login__form_action_container button[type="submit"]'; aria-label is more stable
      submitButtonClass:
        ".login__form_action_container button[type='submit']:visible, button[type='submit']:visible, button[data-litms-control-urn='login-submit']:visible",
      submitButtonAria:
        "button[aria-label='Sign in']:visible, button[data-litms-control-urn='login-submit']:visible",
    },
    // Verified 2026-05-20 via scripts/discover-selectors.ts — all appeared in the DOM dump when logged in
    loginIndicators: {
      // Feed share box — click target is the role=button parent whose child has aria-label
      startPostAria: 'div[role="button"]:has(> [aria-label="Start a post"])',
      // Home nav link — logged-in only; aria-label contains notification count
      homeNavLink: 'a[aria-label^="Home,"]',
      // Logged-in-only landmark
      skipNav: 'a[aria-label="Skip navigation menu"]',
      // Main feed landmark
      primaryContent: '[aria-label="Primary content"]',
      // Me dropdown trigger
      switchAccount: '[aria-label="Switch to different account"]',
      // Messaging nav icon — href patterns are stable
      messagingNav: "a[href='/messaging/']",
    },
    composer: {
      // Verified 2026-05-20 via scripts/discover-selectors.ts
      // LinkedIn structure: <div role="button"><div aria-label="Start a post">...</div></div>
      // The role=button parent is the actual click handler.
      startPostTrigger: 'div[role="button"]:has(> [aria-label="Start a post"])',
      startPostTriggerAria: 'div[role="button"]:has(> [aria-label="Start a post"])',
      modal: '.share-box',
      modalAria: "div[role='dialog']",
      textEditor: '.editor-content',
      textEditorAria: "div[role='textbox']",
      // The Post button: original was '.share-actions__primary-action'
      postButton: '.share-actions__primary-action',
      postButtonAria: "button[aria-label='Post']",
      // Image attach: triggers the file input
      imageButtonAria: "button[aria-label='Add a photo']",
      // Click inside the "Select files to begin" intermediate modal; this opens the OS file picker.
      uploadFromComputerButton: 'button[aria-label="Upload from computer"]',
      // The hidden input that accepts the file
      fileInput: "input[type='file']",
      // Image preview selector from withImage.js
      imagePreview: '.ivm-view-attr__img--centered',
    },
    companyPage: {
      startPostTrigger:
        "button[aria-label='Start a post'], button[aria-label='Create a post'], button:has-text('Start a post'), button:has-text('Create a post')",
      startPostTriggerXPath:
        "//button[contains(normalize-space(.), 'Start a post') or contains(normalize-space(.), 'Create a post')]",
    },
    // Article composer flow (URL: /article/new/[?author=urn:li:fsd_company:<id>])
    // Verified 2026-05-20 from user-provided HTML dump
    article: {
      // Stage 1: article editor page
      coverImageUploadButton: 'button[aria-label="Upload from computer"]',
      titleTextarea:
        '#article-editor-headline__textarea, textarea.article-editor-headline__textarea, textarea[placeholder="Title"]',
      bodyEditor:
        '[data-test-article-editor-content-textbox], div[aria-label="Article editor content"], .ProseMirror[role="textbox"]',
      manageDropdown:
        'button[aria-label="Manage menu"], button.article-editor-manage-menu__dropdown-trigger',
      nextButton:
        'button.article-editor-nav__publish:has-text("Next"), button.article-editor-nav__publish',

      // Stage 2: share modal (appears after clicking Next)
      shareModal: '.share-box, [role="dialog"]:has(.share-creation-state)',
      shareModalAuthorTrigger: 'button.share-unified-settings-entry-button',
      shareModalIntroEditor:
        '[data-test-ql-editor-contenteditable="true"], div[aria-label="Text editor for creating content"]',
      shareModalArticlePreviewTitle: '.update-components-article-first-party__title',
      shareModalScheduleButton:
        'button[aria-label="Schedule post"], button.share-actions__scheduled-post-btn',
      // CRITICAL: Use :has-text("Publish") to disambiguate from companyShare.postButton which has the same class
      shareModalPublishButton: 'button.share-actions__primary-action:has-text("Publish")',
    },
    // Verified 2026-05-20 from user-provided HTML dump of the company-share composer
    companyShare: {
      // URL template — replace {companyId} with the numeric or slug company ID
      url: '/company/{companyId}/admin/page-posts/published/?share=true',
      // Media attach button in the company composer toolbar
      addMediaButton: "button[aria-label='Add media']",
      // data-test attribute first (most stable), then aria-label, then structural, then class-based
      textEditor:
        '[data-test-ql-editor-contenteditable="true"], div[aria-label="Text editor for creating content"], div[contenteditable="true"][role="textbox"][aria-multiline="true"]',
      postButton: 'button.share-actions__primary-action, button.artdeco-button--primary',
      scheduleButton:
        'button[aria-label="Schedule post"], button.share-actions__scheduled-post-btn',
    },
    checkpoint: {
      // Selectors used to detect a checkpoint/email-verify screen. Best signals are URL prefix
      // plus presence of common verify-page text. We list a few text-content checks here.
      verifyHeadingText: "Let's do a quick security check",
      enterCodeInput: "input[name='pin']",
      submitVerifyAria: "button[aria-label='Submit']",
    },
    feed: {
      // For confirming a post landed — feed posts show .feed-shared-update-v2 around new content
      sharedUpdateContainer: '.feed-shared-update-v2',
      postPublishedToast:
        "[role='alert'], .artdeco-toast-item, .global-alert, .artdeco-inline-feedback",
    },
  },
  limits: {
    // LinkedIn allows ~3000 chars in a feed post body. Soft enforce.
    maxPostLength: 3000,
  },
  domains: {
    primary: '.linkedin.com',
  },
} as const;

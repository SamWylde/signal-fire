import { DEFAULT_TIMEOUTS } from '../../core/timeouts.js';

export const INSTAGRAM = {
  urls: {
    home: 'https://www.instagram.com/',
    login: 'https://www.instagram.com/accounts/login/',
  },
  timeouts: {
    ...DEFAULT_TIMEOUTS,
    uploadProcessingMs: 120_000,
  },
  selectors: {
    login: {
      // Instauto: input[name="username"] and input[name="password"]
      username: "input[name='username'], input[name='email']",
      password: "input[name='password'], input[name='pass']",
      submit:
        "div[role='button']:has-text('Log in'), div[role='button']:has-text('Log In'), button[type='submit']",
      // The "Save info?" prompt after login — best-effort dismiss
      saveInfoNotNow: "//button[contains(text(),'Not now') or contains(text(), 'Not Now')]",
      // The "Turn on Notifications?" prompt
      notificationsNotNow: "//button[contains(text(),'Not Now')]",
    },
    loginIndicators: {
      // Verified 2026-05-20 from user-provided HTML. Instagram uses heavy CSS class obfuscation
      // but sidebar nav aria-labels and href patterns are stable.
      homeNav: 'a[aria-label="Home"]',
      newPostNav: 'a[aria-label="New post"]',
      profileNav: 'a[aria-label="Profile"]',
      messagesNav: 'a[href="/direct/inbox/"]',
      exploreNav: 'a[href="/explore/"]',
      // business/creator account only:
      professionalDashboard: 'a[aria-label="Professional dashboard"]',
    },
    composer: {
      // Stage 0: sidebar trigger — verified 2026-05-20
      newPostTrigger: 'a[aria-label="New post"]',

      // Stage 1: create new post modal — verified 2026-05-20
      createModal: '[aria-label="Create new post"][aria-modal="true"][role="dialog"]',
      createModalHeading: '[role="heading"]:has-text("Create new post")',
      selectFromComputerButton: 'button:has-text("Select from computer")',
      // The actual file upload target — use locator.setInputFiles on this to bypass OS file picker
      fileInput: '[aria-label="Create new post"][role="dialog"] input[type="file"]',
      dragDropHeading: 'h3:has-text("Drag photos and videos here")',

      // Legacy / fallback dialog selector (less specific than createModal)
      dialog: 'div[role="dialog"]',

      // Stage 2: Crop screen
      // Verified 2026-05-20 from user-provided HTML of the Crop screen.
      cropScreenHeading: '[role="heading"]:has-text("Crop")',

      // Stage 3: Edit screen (Filters/Adjustments tabs — combined screen, NOT separate screens)
      // Verified 2026-05-20 from user-provided HTML.
      editScreenHeading: '[role="heading"]:has-text("Edit")',
      editTabFilters: '[role="tab"]:has-text("Filters")',
      editTabAdjustments: '[role="tab"]:has-text("Adjustments")',
      // Next button (top-right of modal header, appears on Crop and Edit screens)
      nextButton:
        '[aria-label="Create new post"][role="dialog"] div[role="button"]:has-text("Next")',
      backButton:
        '[aria-label="Create new post"][role="dialog"] div[role="button"]:has(svg[aria-label="Back"])',

      // Stage 4: Caption + Share (final screen) — VERIFIED 2026-05-20
      // Modal heading stays "Create new post" — use shareButton presence to detect arrival on this screen.
      // Caption is a Lexical contenteditable div, NOT a textarea.
      captionEditor: 'div[aria-label="Write a caption..."][contenteditable="true"][role="textbox"]',
      shareButton:
        '[aria-label="Create new post"][role="dialog"] div[role="button"]:has-text("Share")',
      emojiButton: 'button:has(svg[aria-label="Emoji"])',
      addLocationInput: 'input[name="creation-location-input"]',
      addCollaboratorsInput: 'input[name="creation-collaborator-input"]',
      accessibilityToggle:
        '[aria-label="Create new post"][role="dialog"] div[role="button"]:has-text("Accessibility")',
      advancedSettingsToggle:
        '[aria-label="Create new post"][role="dialog"] div[role="button"]:has-text("Advanced settings")',

      // Optional Crop screen controls (rarely needed — defaults work)
      selectCropButton: 'button:has(svg[aria-label="Select crop"])',
      selectZoomButton: 'button:has(svg[aria-label="Select zoom"])',
      openMediaGalleryButton: 'button:has(svg[aria-label="Open media gallery"])',

      // Confirmation: success modal shown after publish.
      shareConfirmationHeading: 'Post shared',
      shareConfirmationText: 'Your post has been shared.',
      shareConfirmation:
        "xpath=//*[normalize-space()='Post shared' or normalize-space()='Your post has been shared.']",
      doneButton: "xpath=//*[@role='button' and normalize-space()='Done']",

      // The Reels-vs-Post selector in the modal (Instagram offers both)
      postMenuItem:
        "xpath=//*[@role='menuitem' or @role='button' or @role='link' or self::a][normalize-space()='Post' or .//*[normalize-space()='Post']]",
      postTypeReel: "//div[@role='button']//span[contains(text(),'Reel')]",
      postTypePost: "//div[@role='button']//span[contains(text(),'Post')]",
    },
    blocked: {
      // Instagram-specific block phrases (in addition to checkBlocked defaults)
      actionBlocked: "//*[contains(text(),'Action Blocked')]",
      tryAgainLater: "//*[contains(text(),'Try Again Later')]",
    },
  },
  limits: {
    // Instagram caption: 2200 chars
    maxCaptionLength: 2200,
    // Hashtags: 30 per post max
    maxHashtags: 30,
  },
  domains: {
    primary: '.instagram.com',
  },
  // Extra block phrases for use with core/humanize.ts checkBlocked
  blockPhrases: [
    'Action Blocked',
    'Try Again Later',
    'We restrict certain activity',
    "We're sorry, but something went wrong",
    'Please wait a few minutes',
    'feedback_required',
  ],
} as const;

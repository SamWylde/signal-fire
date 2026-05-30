import { DEFAULT_TIMEOUTS } from '../../core/timeouts.js';

export const FACEBOOK = {
  urls: {
    home: 'https://www.facebook.com/',
    login: 'https://www.facebook.com/', // login form is on the home page
    // Note: caller passes the target Page URL (e.g. https://www.facebook.com/<page-id>) per-post.
  },
  timeouts: {
    ...DEFAULT_TIMEOUTS,
    typingDelayMs: 50, // facebook-automation uses keyboard.press with delay; we use humanType
  },
  selectors: {
    profileSwitcher: {
      // Verified 2026-05-20 from user-provided HTML. Facebook uses heavy CSS class obfuscation
      // but aria-labels are stable.
      triggerButton: 'div[aria-label="Your profile"][role="button"]',
      quickSwitchList: '[aria-label="Quick switch profiles"][role="list"]',
      personalProfileLink: 'a[href="/me/"]',
      // Use buildFacebookPageSwitchSelector(pageName) to build this dynamically
      switchToPagePrefix: 'div[role="button"][aria-label="Switch to ', // suffix: pageName + '"]'
      seeAllProfilesButton: '[aria-label="See all profiles"]',
    },
    cookieBanner: {
      // CSS — most stable across regions
      acceptButton: "[data-cookiebanner='accept_button']",
    },
    login: {
      email: "input[name='email'], #email",
      password: "input[name='pass'], #pass",
      submitButton:
        "div[role='button']:has-text('Log in'), div[role='button']:has-text('Log In'), button:has-text('Log in'), button[name='login'], button[type='submit'], input[type='submit']",
      submitForm: ".login__form_action_container button[type='submit']",
    },
    loginIndicators: {
      // The presence of these signals a logged-in session. None are bulletproof; check all.
      // Source: empirical; FB shows the composer trigger only when logged in.
      navBarSearch: "[aria-label='Search Facebook']",
      // FB strips this if logged out; if present we're logged in
      profileShortcut: "[aria-label='Your profile']",
      // Top nav Home link — only present in the authenticated nav rail
      navHome: "a[aria-label='Home'], a[href='/'][aria-current='page']",
    },
    composer: {
      // Verified 2026-05-20 from user-provided HTML dump of the Facebook composer
      // (inline trigger + Stage 1 modal + Stage 2 settings).
      // Facebook uses heavy CSS class obfuscation but aria-labels are stable.

      // Stage 0: inline trigger on the page (before opening modal)
      inlineRegion: '[aria-label="Create a post"][role="region"]',
      inlinePlaceholder: 'div[role="button"]:has-text("What\'s on your mind")',
      inlineLiveVideo: '[aria-label="Live video"][role="button"]',
      inlinePhotoVideo: '[aria-label="Photo/video"][role="button"]',
      inlineReel: '[aria-label="Reel"][role="button"]',

      // Stage 1: composer modal
      modal: '[aria-label="Create post"][role="dialog"][aria-modal="true"]',
      modalOuter: '[role="dialog"][aria-modal="true"]',
      modalCloseButton: '[aria-label="Close composer dialog"][role="button"]',
      modalPrivacyTrigger: '[aria-label^="Edit privacy"][role="button"]',
      // The text editor — Lexical contenteditable, stable selector
      textEditor:
        '[role="dialog"][aria-modal="true"] div[contenteditable="true"][data-lexical-editor="true"][role="textbox"]',
      modalBackgroundOptions: '[aria-label="Show background options"][role="button"]',
      modalEmoji: '[aria-label="Emoji"][role="button"]',
      modalPhotoVideo: '[aria-label="Photo/video"][role="button"]',
      modalTagPeople: '[aria-label="Tag people"][role="button"]',
      modalCheckIn: '[aria-label="Check in"][role="button"]',
      modalFeeling: '[aria-label="Feeling/activity"][role="button"]',
      modalMoreOptions: '[aria-label="More post options"][role="button"]',
      // Next button — advances to Stage 2. Disabled (aria-disabled="true") until text or media is added.
      nextButton: '[aria-label="Next"][role="button"]',

      // Stage 2: post settings dialog (after clicking Next)
      settingsDialog: '[aria-label="Post settings"][role="dialog"]',
      settingsBackButton: '[aria-label="Back"][role="button"]',
      // Scoped only by aria-label="Post" + role="button" — the in-page JS filter in
      // clickFacebookSettingsPostButton picks the bottommost visible match, which is the
      // submit button in whichever dialog is currently open. The previous dialog-scoped
      // selector broke when Facebook changed the Stage 2 dialog's aria-label.
      postSubmitButton: '[aria-label="Post"][role="button"]',

      // File input for image/video upload — already present in the DOM inside the modal,
      // sibling to the "Photo/video" button. setInputFiles on this directly to avoid opening
      // the native OS file picker.
      modalFileInput: '[role="dialog"][aria-modal="true"] input[type="file"][accept*="image"]',
      // Confirmation element that appears after successful image attach.
      attachedMediaGroup:
        '[role="dialog"][aria-modal="true"] [aria-label="Attached media"][role="group"]',

      // Legacy fallback selectors (kept for photo/video upload path)
      dialogRole: "div[role='dialog']",
      dialogForm: "div[role='dialog'] form[method='POST']",
      photoVideoButtonAria: "div[aria-label='Photo/Video']",
    },
  },
  labels: {
    createPost: 'Create post',
    post: 'Post',
    photoVideo: 'Photo/Video',
    addPhotosVideos: 'Add Photos/Videos',
  },
  limits: {
    // FB has no hard char limit on Pages; soft limit ~63K chars. We don't enforce.
  },
  domains: {
    primary: '.facebook.com',
  },
} as const;

export function buildFacebookPageSwitchSelector(pageName: string): string {
  // CSS attribute selectors require escaping double quotes inside the value
  const escaped = pageName.replace(/"/g, '\\"');
  return `div[aria-label="Switch to ${escaped}"][role="button"]`;
}

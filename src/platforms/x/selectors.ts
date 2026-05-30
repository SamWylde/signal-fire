import { DEFAULT_TIMEOUTS } from '../../core/timeouts.js';

export const X = {
  urls: {
    home: 'https://x.com/home',
    login: 'https://x.com/i/flow/login',
    composePost: 'https://x.com/compose/post',
    composeTweet: 'https://x.com/compose/tweet',
  },
  timeouts: {
    ...DEFAULT_TIMEOUTS,
    postReadyMs: 30_000,
  },
  selectors: {
    login: {
      usernameInput: "input[autocomplete='username'], input[name='text']",
      alternateIdentifierInput: "input[data-testid='ocfEnterTextTextInput'], input[name='text']",
      passwordInput: "input[name='password']",
      nextButton: "button:has-text('Next'), div[role='button']:has-text('Next')",
      loginButton:
        "button[data-testid='LoginForm_Login_Button'], button:has-text('Log in'), div[role='button']:has-text('Log in')",
    },
    // --- Login state indicators ---
    loginIndicators: {
      sidebarAccountSwitcher: "//*[@data-testid='SideNav_AccountSwitcher_Button']",
      appTabBarProfile: "//*[@data-testid='AppTabBar_Profile_Link']",
      primaryColumn: "//div[@data-testid='primaryColumn']",
    },
    // --- Composer (direct-URL route: https://x.com/compose/post) ---
    // Verified 2026-05-20 from user-provided HTML dump. X uses data-testid attributes
    // throughout — these are by far the most stable selectors on X.
    composer: {
      modal: 'div[role="dialog"][aria-modal="true"]',
      textEditor: '[data-testid="tweetTextarea_0"]',
      textEditorContainer: '[data-testid="tweetTextarea_0RichTextInputContainer"]',
      closeButton: '[data-testid="app-bar-close"]',
      draftsButton: '[data-testid="unsentButton"]',
      fileInput: '[data-testid="fileInput"]',
      gifButton: '[data-testid="gifSearchButton"]',
      pollButton: '[data-testid="createPollButton"]',
      scheduleButton: '[data-testid="scheduleOption"]',
      geoButton: '[data-testid="geoButton"]',
      contentDisclosureButton: '[data-testid="contentDisclosureButton"]',
      toolbar: '[data-testid="toolBar"]',
      replySettingsButton: 'button[aria-label="Everyone can reply"]',
      // CRITICAL: this is the actual submit button. Only click after dry-run check.
      postButton: '[data-testid="tweetButton"]',
    },
    // Sidebar trigger — opens composer modal (safe; does not submit)
    sidebarTrigger: '[data-testid="SideNav_NewTweet_Button"]',
    // --- Sidebar compose modal (the quick-tweet button) ---
    sidebarCompose: {
      newTweetButton: "//a[@data-testid='SideNav_NewTweet_Button']",
      layers: "//div[@data-testid='layers']",
      textArea: "//div[@data-testid='tweetTextarea_0']",
      // In the sidebar modal, the post button is 'tweetButtonInline' (social-poster precedent)
      postButton: "//button[@data-testid='tweetButtonInline']",
      postButtonFallback:
        "//button[@data-testid='tweetButtonInline' or @data-testid='tweetButton']",
    },
    // --- Standalone /compose/tweet page ---
    composeStandalone: {
      textArea: "//div[@data-testid='tweetTextarea_0']",
      // On the standalone page, the post button is 'tweetButton' (twitter-automation-ai precedent)
      postButton: "//button[@data-testid='tweetButton']",
      postButtonFallback:
        "//button[@data-testid='tweetButton' or @data-testid='tweetButtonInline']",
    },
    // --- Media upload (works in both contexts) ---
    media: {
      mediaButton: "//button[@data-testid='mediaButton']",
      fileInput: "//input[@data-testid='fileInput' and @type='file']",
    },
    // --- Audience / Community posting ---
    audience: {
      chooseAudienceButton:
        "//button[@aria-label='Choose audience' or contains(@aria-label, 'audience') or contains(., 'Everyone')]",
      container: "//div[@data-testid='HoverCard'] | //div[@role='dialog' and @aria-modal='true']",
    },
    // --- Overlays / masks (wait for these to disappear before clicking post) ---
    overlays: {
      twcCcMask: "[data-testid='twc-cc-mask']",
    },
    // --- Reply / retweet (for future expansion) ---
    engagement: {
      replyButton: "//button[@data-testid='reply']",
      retweetButton: "//button[@data-testid='retweet']",
      unretweetButton: "//button[@data-testid='unretweet']",
      retweetConfirm: "//button[@data-testid='retweetConfirm']",
      dropdownMenu: "//div[@data-testid='Dropdown']",
    },
    // --- Tweet article + content ---
    article: {
      tweetArticle: "//article[@data-testid='tweet']",
      userName: "//div[@data-testid='User-Name']//span[1]//span",
      userHandle: "//div[@data-testid='User-Name']//span[contains(text(), '@')]",
      tweetText: "//div[@data-testid='tweetText']//span | //div[@data-testid='tweetText']//a",
      statusLink: "//a[contains(@href, '/status/') and .//time]",
      timeTag: './/time',
    },
  },
  limits: {
    maxTweetLength: 280,
    maxImagesPerTweet: 4,
    maxVideosPerTweet: 1,
  },
  domains: {
    primary: '.x.com',
    legacy: '.twitter.com',
  },
} as const;

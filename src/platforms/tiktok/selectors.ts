export const TIKTOK = {
  urls: {
    upload: 'https://www.tiktok.com/creator-center/upload?lang=en',
    home: 'https://www.tiktok.com/',
    login: 'https://www.tiktok.com/login/phone-or-email/email',
  },

  timeouts: {
    implicitWaitMs: 30 * 1000,
    explicitWaitMs: 60 * 1000,
    addHashtagWaitMs: 5 * 1000,
    uploadingWaitMs: 180 * 1000,
  },

  limits: {
    maxDescriptionLength: 150,
  },

  selectors: {
    login: {
      usernameField: '//input[@name="username"]',
      passwordField: '//input[@type="password"]',
      loginButton: '//button[@type="submit"]',
      cookieOfInterest: 'sessionid',
    },

    loginIndicators: {
      navProfile: "[data-e2e='nav-profile'], [data-e2e='profile-icon']",
      inboxIcon: "[data-e2e='inbox-icon']",
      // Upload button in the top nav — only shown to logged-in users
      uploadButton: "[data-e2e='upload-icon'], a[href*='/upload']",
    },

    upload: {
      iframe: '//iframe',
      splitWindow: "//button[./div[text()='Not now']]",
      uploadVideo: "//input[@type='file']",
      uploadFinished: "//div[contains(@class, 'btn-cancel')]",
      uploadConfirmation: '//div[@title]',
      processConfirmation: "//div[contains(@class, 'resolution-label-text')]",
      description: "//div[@contenteditable='true']",
      visibility: "//div[@class='tiktok-select-selector']",
      visibilityOptions: ['Public', 'Friends', 'Private'],
      mentionBox: "//div[contains(@class, 'mention-list-popover')]",
      mentionBoxUserId: "//span[contains(@class, 'user-id')]",
      comment: "//label[.='Comment']/following-sibling::div/input",
      duet: "//label[.='Duet']/following-sibling::div/input",
      stitch: "//label[.='Stitch']/following-sibling::div/input",
      post: "//button[@data-e2e='post_video_button']",
      postNow: "//button[.//div[text()='Post now']]",
      postConfirmation:
        "//div[contains(text(), 'Your video has been uploaded') or contains(text(), '视频已发布') or contains(text(), 'Video published')]",
    },

    schedule: {
      switch: "//*[@id='tux-1']",
      datePicker: "//div[contains(@class, 'date-picker-input')]",
      calendar: "//div[contains(@class, 'calendar-wrapper')]",
      calendarMonth: "//span[contains(@class, 'month-title')]",
      calendarValidDays:
        "//div[@class='jsx-4172176419 days-wrapper']//span[contains(@class, 'day') and contains(@class, 'valid')]",
      calendarArrows: "//span[contains(@class, 'arrow')]",
      timePicker: "//div[contains(@class, 'time-picker-input')]",
      timePickerText: "//div[contains(@class, 'time-picker-input')]/*[1]",
      timePickerContainer: "//div[@class='tiktok-timepicker-time-picker-container']",
      timepickerHours: "//span[contains(@class, 'tiktok-timepicker-left')]",
      timepickerMinutes: "//span[contains(@class, 'tiktok-timepicker-right')]",
    },

    cookiesBanner: {
      banner: 'tiktok-cookie-banner',
      button: 'div.button-wrapper',
    },

    cover: {
      coverPreview: "//img[contains(@class, 'cover-image')]",
      editCoverButton: "//div[contains(@class, 'edit-container')]",
      editCoverContainer: "//div[contains(@class, 'cover-edit-container')]",
      uploadCoverTab: "//div[contains(text(), 'Upload cover')]",
      uploadCover: "//input[@type='file' and @accept='image/png, image/jpeg, image/jpg']",
      uploadConfirmation:
        "//div[not(contains(@class, 'hide-panel'))]/div[contains(@class, 'cover-edit-footer')]/button[contains(@class, 'TUXButton--primary')]",
      exitCoverContainer: "//div[@class='jsx-3186560874']",
    },
  },

  fileTypes: {
    videoExtensions: ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp', '3g2', 'gif'],
    coverExtensions: ['png', 'jpg', 'jpeg'],
  },

  disguising: {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
  },
} as const;

export const YOUTUBE = {
  urls: {
    upload: 'https://studio.youtube.com',
    studio: 'https://studio.youtube.com',
    login: 'https://accounts.google.com/ServiceLogin?service=youtube',
    youtube: 'https://www.youtube.com',
  },
  timeouts: {
    // YouTube Studio is HEAVY. Generous timeouts.
    shortMs: 8_000,
    mediumMs: 20_000,
    longMs: 60_000,
    uploadProcessingMs: 600_000, // up to 10 min for upload-processing to complete
  },
  selectors: {
    login: {
      email: "input[type='email'], input[name='identifier']",
      password: "input[name='Passwd'], input[type='password']:not([aria-hidden='true'])",
      nextButton: "button:has-text('Next')",
    },
    // --- Studio file input ---
    upload: {
      // The file picker is a standard <input type="file">. Stable across Studio versions.
      dialog: 'ytcp-uploads-dialog',
      fileInput: "ytcp-uploads-dialog input[type='file']:not(#file-loader)",
      thumbnailFileInput: 'ytcp-uploads-dialog input#file-loader, input#file-loader',
      createButton:
        "ytcp-button#create-icon, button[aria-label='Create'], ytcp-button[aria-label='Create']",
      uploadVideosMenuItem:
        "tp-yt-paper-item[test-id='upload-beta'], ytcp-ve[command='UPLOAD_VIDEO'], [role='menuitem']:has-text('Upload videos')",
    },
    // --- Login indicators ---
    loginIndicators: {
      // Studio top-right avatar button (Polymer)
      ytStudioAvatar: 'ytcp-button#avatar-btn',
      // Generic: presence of the channel-side rail
      channelSideRail: 'ytcp-navigation-drawer',
      // Create button in Studio header — only visible when authenticated
      createButton: 'ytcp-button#create-icon, [aria-label="Create"]',
    },
    // --- Metadata fields ---
    metadata: {
      // Title and Description: both render as <div id="textbox" contenteditable="true">.
      // Prefer the labeled wrappers below, then fall back to positional textboxes if Studio changes labels.
      textbox: '#textbox',
      // Studio uses these aria-labels on the outer paper-input element.
      titleAria: "[aria-label='Title (required)']",
      descriptionAria: "[aria-label='Description']",
      // Tags input (hidden behind Show More): #text-input inside an ytcp-form-input-container
      tagsInput: "ytcp-form-input-container[role='textbox'] #text-input",
      tagsInputAria: "[aria-label='Tags']",
      // "Show more" toggle that reveals tags + other advanced fields
      showMore: '#toggle-button',
    },
    // --- Audience / Kids ---
    audience: {
      // The radio-button group container; original used name="VIDEO_MADE_FOR_KIDS_NOT_MFK"
      // We target by name attribute on the radio host — still emitted by Studio
      notMadeForKids: "[name='VIDEO_MADE_FOR_KIDS_NOT_MFK']",
      // Each radio button has an inner #radioLabel that needs to be clicked (not the host)
      radioLabel: '#radioLabel',
    },
    // --- Playlist ---
    playlist: {
      // Section host element
      dropdown: 'ytcp-video-metadata-playlists',
      // Search-within-playlist input
      searchInput: '#search-input',
      // Container for results
      itemsContainer: '#items',
      // Each row text — caller templates this with the playlist name (escape carefully)
      itemRowTextTemplate: '//span[text()=$NAME]', // sentinel for caller to substitute; not used directly
      newButton: '.new-playlist-button',
      createContainer: '#create-playlist-form',
      createTitleTextarea: '#create-playlist-form textarea',
      createButton: '.create-playlist-button',
      // Done button at bottom of playlist popover
      // HIGH-RISK: aria-label text is locale-sensitive; requires en-US locale
      doneButtonAria: "ytcp-button[aria-label='Done'], .done-button",
    },
    // --- Visibility ---
    visibility: {
      // Radio buttons named by visibility
      public: "[name='PUBLIC']",
      unlisted: "[name='UNLISTED']",
      private: "[name='PRIVATE']",
      radioLabel: '#radioLabel',
      // Schedule
      // HIGH-RISK: #datepicker-trigger and date/time inputs are inside Polymer shadow DOM;
      // if these stop working, inspect ytcp-datetime-picker internals in headed mode.
      schedule: "[name='SCHEDULE']",
      scheduleDatePicker: '#datepicker-trigger',
      scheduleDateInput: 'ytcp-date-picker input',
      scheduleTimeInput: 'ytcp-time-of-day input',
    },
    // --- Navigation ---
    nav: {
      // Studio uses 'next-button' and 'done-button' as element IDs across steps
      nextButton: '#next-button',
      doneButton: '#done-button',
    },
    // --- Upload progress / errors / video URL ---
    progress: {
      // Status container with progress text. Original was an absolute XPath; replaced with element selector.
      // HIGH-RISK: ytcp-video-upload-progress[@uploading=""] attribute may change.
      uploadStatus: 'ytcp-video-upload-progress',
      // Error container
      error: '#error-message, ytcp-video-upload-progress #error-message',
      // After upload, the video URL appears in a fadeable span inside ytcp-video-info
      videoUrlContainer: 'ytcp-video-info span.video-url-fadeable',
      videoUrlAnchor: 'ytcp-video-info a.style-scope.ytcp-video-info',
    },
  },
  limits: {
    maxTitleLength: 100,
    maxDescriptionLength: 5000,
    maxTags: 500, // total chars in tags string
  },
  locale: {
    // Fingerprint locale is selected per account; selectors avoid relying on localized copy.
    requested: 'en-US',
  },
  domains: {
    primary: '.youtube.com',
    google: '.google.com', // YouTube auth cookies live under google.com
  },
} as const;

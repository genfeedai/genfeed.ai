# Genfeed Chrome Extension - Permissions Justification

**Last Updated:** January 27, 2025

This document explains why the Genfeed Chrome Extension requests each permission and how it is used.

## Required Permissions

### 1. `storage`

**Purpose:** Store authentication tokens, user preferences, and cached data locally in your browser.

**Why Required:**

- The Extension needs to store your login session (OAuth tokens) to keep you authenticated
- User preferences (default tone, style settings) are stored locally
- Generated content is cached locally for quick access
- Offline queue stores failed requests for retry when connectivity is restored

**Data Stored:**

- Authentication tokens (encrypted by Chrome)
- User account information (name, email, organization ID)
- Extension settings and preferences
- Cached generated content
- Offline request queue

**Privacy Impact:** Low - All data is stored locally in your browser, never transmitted to third parties except for authentication tokens sent to Genfeed API.

**User Control:** You can clear all stored data at any time via Chrome Settings → Extensions → Genfeed → Details → Clear storage.

---

### 2. `tabs`

**Purpose:** Detect when you're viewing Twitter/X pages to activate Extension features.

**Why Required:**

- The Extension needs to know when you're on Twitter/X to show "Generate Reply" and "Generate Image" buttons
- We check the current tab's URL to determine if Extension features should be available
- This enables the Extension to work seamlessly on Twitter/X without manual activation

**Data Accessed:**

- Current tab URL (to detect twitter.com or x.com)
- Tab title (to identify page type)

**Privacy Impact:** Minimal - We only check if you're on Twitter/X, we do not access tab content unless you explicitly use Extension features.

**User Control:** The Extension only activates on Twitter/X pages. It does not access tabs on other websites.

---

### 3. `cookies`

**Purpose:** Manage authentication cookies for OAuth flow and API session management.

**Why Required:**

- Clerk (our authentication provider) uses cookies for OAuth authentication
- API session management requires cookie-based authentication
- This enables secure login without storing passwords

**Data Accessed:**

- Authentication cookies from api.genfeed.ai
- OAuth session cookies from Clerk

**Privacy Impact:** Low - Cookies are only used for authentication with Genfeed services. We do not access cookies from other websites.

**User Control:** You can revoke access by logging out of the Extension or clearing Extension data.

---

### 4. `scripting`

**Purpose:** Inject UI elements (buttons, modals) into Twitter/X pages.

**Why Required:**

- The Extension adds "Generate Reply" and "Generate Image" buttons directly into Twitter/X's interface
- This provides a seamless, native experience without leaving Twitter/X
- UI elements are injected only when you're on Twitter/X pages

**Data Accessed:**

- Twitter/X page DOM (only to inject UI elements)
- Tweet content (only when you click Extension buttons)

**Privacy Impact:** Low - We only inject UI elements and access tweet content when you explicitly use Extension features. We do not monitor or collect data passively.

**User Control:** Extension features only activate when you click the injected buttons. No passive data collection.

---

### 5. `activeTab`

**Purpose:** Access the current tab's content to extract tweet text and context.

**Why Required:**

- When you click "Generate Reply," we need to extract the tweet content you're replying to
- When you click "Generate Image," we need to extract tweet content as the image prompt
- This enables context-aware content generation

**Data Accessed:**

- Tweet text content (only when you click Extension buttons)
- Tweet author information (username, handle)
- Tweet URL

**Privacy Impact:** Low - We only access tweet content when you explicitly click Extension buttons. We do not read or store tweets passively.

**User Control:** Extension only accesses tweet content when you use a feature. You can see exactly what data is being used in the generation modal.

---

## Host Permissions

### 6. `https://*.twitter.com/*` and `https://*.x.com/*`

**Purpose:** Access Twitter/X pages to inject UI elements and extract tweet content.

**Why Required:**

- The Extension's core functionality requires interaction with Twitter/X pages
- We inject "Generate Reply" and "Generate Image" buttons into Twitter/X's interface
- We extract tweet content when you use Extension features

**Data Accessed:**

- Tweet content (only when you use Extension features)
- Twitter/X page structure (to inject UI elements)

**Privacy Impact:** Low - We only access data when you explicitly use Extension features. No passive monitoring.

**User Control:** Extension only works on Twitter/X. It does not access other websites.

---

### 7. `https://api.genfeed.ai/*`

**Purpose:** Communicate with Genfeed API for AI content generation and account management.

**Why Required:**

- All AI generation (tweets, images, memes) is processed by our API
- Account authentication and management requires API access
- User preferences and account data are synced via API

**Data Transmitted:**

- Authentication tokens (for API requests)
- Generation prompts and parameters
- Account information (for personalized generation)

**Privacy Impact:** Medium - Data is transmitted to our servers for processing. All data is encrypted in transit (HTTPS) and handled according to our Privacy Policy.

**User Control:** You can see what data is sent in the browser's Network tab. All API requests are authenticated and logged.

---

### 8. Additional Host Permissions (YouTube, Instagram, etc.)

**Purpose:** Content detection and quick actions for multiple platforms.

**Why Required:**

- The Extension can detect content on YouTube, Instagram, Reddit, TikTok, LinkedIn, Facebook
- This enables "Save as Inspiration" and quick content generation from various platforms
- Features are opt-in and only activate when you use them

**Data Accessed:**

- Page content (only when you use Extension features)
- Video/article titles and metadata

**Privacy Impact:** Low - We only access content when you explicitly use Extension features. No passive data collection.

**User Control:** Extension features are opt-in. You control when content is accessed.

---

## Permission Usage Summary

| Permission          | Purpose                        | Data Accessed            | Privacy Impact | User Control             |
| ------------------- | ------------------------------ | ------------------------ | -------------- | ------------------------ |
| `storage`           | Store auth tokens, preferences | Local browser storage    | Low            | Can clear anytime        |
| `tabs`              | Detect Twitter/X pages         | Tab URL only             | Minimal        | Only on Twitter/X        |
| `cookies`           | OAuth authentication           | Auth cookies only        | Low            | Logout to revoke         |
| `scripting`         | Inject UI elements             | Twitter/X DOM            | Low            | Only when using features |
| `activeTab`         | Extract tweet content          | Tweet text (on click)    | Low            | Only when using features |
| `twitter.com/x.com` | Core functionality             | Tweet content (on click) | Low            | Only when using features |
| `api.genfeed.ai`    | AI generation                  | Generation prompts       | Medium         | Encrypted, authenticated |
| Other platforms     | Content detection              | Page content (on click)  | Low            | Opt-in features          |

## Data Minimization

We follow the principle of data minimization:

- We only request permissions necessary for Extension functionality
- We only access data when you explicitly use Extension features
- We do not passively monitor or collect data
- All data access is transparent and user-initiated

## Security Measures

- All API communication uses HTTPS/TLS encryption
- Authentication tokens are stored securely in Chrome's encrypted storage
- No sensitive data is stored in plaintext
- Content Security Policy prevents unauthorized script execution
- Regular security audits and updates

## User Rights

You have the right to:

- **Revoke permissions**: Uninstall the Extension to revoke all permissions
- **Clear data**: Clear Extension storage at any time
- **Control access**: Extension only accesses data when you use features
- **View data**: Check what data is stored in Chrome's Extension storage viewer
- **Delete account**: Contact support@genfeed.ai to delete your account data

## Questions or Concerns

If you have questions about how permissions are used, please contact us:

**Email**: privacy@genfeed.ai  
**Support**: support@genfeed.ai  
**Website**: https://genfeed.ai

---

**This document is part of our commitment to transparency and user privacy.**

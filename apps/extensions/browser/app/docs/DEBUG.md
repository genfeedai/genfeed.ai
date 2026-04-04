# Genfeed Extension Debug Guide

## 🐛 Debugging Setup

### 1. Keep Extension Open for Debugging

The extension now includes:

- **Debug Panel**: Shows real-time auth state in the top-right corner
- **Console Logging**: Detailed logs for authentication flow
- **Popup Persistence**: Prevents automatic closing during development

### 2. Debug Commands

```bash
# Start development with debug mode
pnpm dev:debug

# Regular development
pnpm dev
```

### 3. Debug Information

The extension now logs:

- ✅ Clerk initialization status
- ✅ Authentication state changes
- ✅ Token retrieval and storage
- ✅ Sign-in button clicks
- ✅ Extension URL generation

### 4. Common Issues & Solutions

#### Sign-in Button Not Working

**Check these in order:**

1. **Clerk Publishable Key**: Look for "Missing" in console logs
2. **Extension URL**: Should be `chrome-extension://[id]/`
3. **Clerk Configuration**: Check if `mode="modal"` is set
4. **Network Issues**: Check if genfeed.ai is accessible

#### Debug Steps:

1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Look for "Genfeed Extension:" logs
4. Check the Debug Panel in the top-right corner

#### Environment Variables

Make sure your `.env` file contains:

```env
PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key_here
PLASMO_PUBLIC_ENV=development
```

### 5. Debug Panel Features

- **Real-time Status**: Shows auth state without refreshing
- **Token Preview**: Shows first 20 characters of token
- **Console Logging**: Click "Log to Console" for detailed info
- **Development Only**: Only shows in development mode

### 6. Troubleshooting Sign-in Issues

#### If SignInButton doesn't respond:

1. Check if Clerk is loaded (Debug Panel shows "Loaded: ✅")
2. Verify publishable key is present
3. Check browser console for errors
4. Ensure extension has proper permissions

#### If authentication fails:

1. Check if genfeed.ai is accessible
2. Verify Clerk configuration in dashboard
3. Check if extension ID is whitelisted in Clerk
4. Look for network errors in DevTools

### 7. Development Tips

- **Keep DevTools Open**: Always have console visible during development
- **Check Debug Panel**: Real-time status updates
- **Reload Extension**: Use Chrome's "Reload" button after changes
- **Clear Storage**: Clear extension storage if auth gets stuck

## 🔧 Quick Fixes

### Reset Extension State:

```javascript
// Run in console to clear all storage
chrome.storage.local.clear();
chrome.storage.sync.clear();
```

### Check Extension Permissions:

1. Go to `chrome://extensions/`
2. Find Genfeed Extension
3. Click "Details"
4. Ensure all permissions are granted

### Verify Clerk Setup:

1. Check Clerk Dashboard
2. Verify publishable key
3. Check allowed origins include your extension ID
4. Verify redirect URLs are configured

# 🔐 JWT Token Setup for Genfeed Extension

## **Yes! You can get the token from `local.genfeed.ai` in development**

### **Current Setup**

The extension now properly handles JWT tokens with the `genfeed-jwt` template, just like your frontend:

```typescript
// Frontend (your existing code)
const token = await getToken({
  template: 'genfeed-jwt',
});

// Extension (now matches)
const token = await getJWTToken(getToken);
```

## 🏗️ **How It Works**

### **1. Token Sources (Priority Order)**

```
1. Clerk JWT Token (Primary)     → getToken({ template: 'genfeed-jwt' })
2. Stored Token (Cache)          → chrome.storage.local
3. Session Cookie (Fallback)     → local.genfeed.ai cookies (dev) / genfeed.ai (prod)
```

### **2. Environment Handling**

```typescript
Development:  local.genfeed.ai cookies + JWT template
Production:  genfeed.ai cookies + JWT template
```

### **3. JWT Template Integration**

```typescript
// Helper function handles the template
export async function getJWTToken(getToken: Function): Promise<string | null> {
  return await getToken({
    template: 'genfeed-jwt',
  });
}
```

## 🔧 **Configuration**

### **Environment Variables**

```env
# .env file
PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key_here
PLASMO_PUBLIC_ENV=development  # This triggers local.genfeed.ai
```

### **Clerk Dashboard Setup**

1. **JWT Template**: Ensure `genfeed-jwt` template exists in Clerk
2. **Allowed Origins**: Add your extension ID to allowed origins
3. **Redirect URLs**: Configure for both dev and prod domains

### **Extension Permissions**

```json
{
  "permissions": ["cookies", "storage", "tabs"],
  "host_permissions": [
    "https://local.genfeed.ai/*", // Development
    "https://genfeed.ai/*" // Production
  ]
}
```

## 🚀 **Token Flow**

### **Development Flow**

```
1. User signs in on local.genfeed.ai
2. Extension detects local.genfeed.ai cookies
3. Clerk getToken({ template: 'genfeed-jwt' }) gets JWT
4. JWT stored in chrome.storage.local
5. API calls use JWT token
```

### **Production Flow**

```
1. User signs in on genfeed.ai
2. Extension detects genfeed.ai cookies
3. Clerk getToken({ template: 'genfeed-jwt' }) gets JWT
4. JWT stored in chrome.storage.local
5. API calls use JWT token
```

## 🐛 **Debugging**

### **Console Logs to Watch For**

```bash
# JWT Token Flow
"Genfeed Extension: User is signed in, getting JWT token..."
"Genfeed Extension: JWT token received, storing..."

# Cookie Fallback
"Genfeed Extension: Checking cookies from https://local.genfeed.ai"
"Genfeed Extension: Token retrieved from __session cookie"

# Environment Detection
"Genfeed Extension: Extension URL: chrome-extension://..."
"Genfeed Extension: Clerk Publishable Key: Present"
```

### **Debug Panel Features**

- ✅ **JWT Token Status**: Shows if JWT token is available
- ✅ **Token Preview**: First 20 characters of JWT
- ✅ **Source Tracking**: Clerk vs cookie source
- ✅ **Environment Info**: Dev vs prod detection

## 🔍 **Troubleshooting**

### **Common Issues**

#### **1. JWT Template Not Found**

```bash
# Error: Template 'genfeed-jwt' not found
# Solution: Create template in Clerk Dashboard
```

#### **2. No Token from local.genfeed.ai**

```bash
# Check: Are you signed in on local.genfeed.ai?
# Check: Does the JWT template exist?
# Check: Are cookies being set correctly?
```

#### **3. Extension Can't Access Cookies**

```bash
# Check: host_permissions in manifest
# Check: Extension ID in Clerk allowed origins
# Check: Cookie names match (__session, __clerk_session, etc.)
```

### **Debug Steps**

1. **Check Console**: Look for JWT token logs
2. **Check Debug Panel**: Real-time token status
3. **Check Clerk Dashboard**: JWT template exists
4. **Check Cookies**: DevTools → Application → Cookies
5. **Check Storage**: DevTools → Application → Local Storage

## 📋 **Testing Checklist**

### **Development Testing**

- [ ] Sign in on `local.genfeed.ai`
- [ ] Open extension popup
- [ ] Check console for JWT token logs
- [ ] Verify debug panel shows token
- [ ] Test API call with JWT token

### **Production Testing**

- [ ] Sign in on `genfeed.ai`
- [ ] Open extension popup
- [ ] Check console for JWT token logs
- [ ] Verify debug panel shows token
- [ ] Test API call with JWT token

## 🎯 **Key Benefits**

### **✅ Matches Frontend**

- Same JWT template (`genfeed-jwt`)
- Same token format and claims
- Consistent authentication flow

### **✅ Environment Aware**

- Automatically detects dev vs prod
- Uses correct domain for cookies
- Handles both local.genfeed.ai and genfeed.ai

### **✅ Robust Fallback**

- JWT token from Clerk (primary)
- Session cookies as fallback
- Multiple cookie name attempts

### **✅ Debug Friendly**

- Comprehensive logging
- Real-time debug panel
- Clear error messages

## 🚨 **Important Notes**

### **JWT Template Requirements**

- Must exist in Clerk Dashboard
- Must be configured for your application
- Must have correct claims and expiration

### **Cookie Permissions**

- Extension needs `cookies` permission
- Must have `host_permissions` for both domains
- Cookie names may vary (check actual names)

### **Environment Detection**

- Uses `PLASMO_PUBLIC_ENV=development`
- Automatically switches between domains
- Fallback to production if not set

The extension now perfectly mirrors your frontend JWT token setup and will work seamlessly with `local.genfeed.ai` in development! 🎉

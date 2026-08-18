# Deployment Guide - ContributionTracker Pro

This guide covers deploying ContributionTracker Pro to Vercel (recommended) and other hosting platforms.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Vercel Deployment (Recommended)](#vercel-deployment-recommended)
3. [Firebase Hosting](#firebase-hosting)
4. [Environment Variables](#environment-variables)
5. [Post-Deployment Setup](#post-deployment-setup)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

1. **Firebase Project Setup**
   - Created a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Enabled Firestore Database
   - Enabled Firebase Authentication (Email/Password)
   - Deployed Firestore security rules (see below)

2. **Git Repository** (for Vercel)
   - Code pushed to GitHub, GitLab, or Bitbucket

---

## Vercel Deployment (Recommended)

Vercel provides the easiest deployment with automatic HTTPS, CDN, and CI/CD.

### Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/hamisi00/ContributionTracker-Pro)

### Manual Deployment

1. **Install Vercel CLI** (optional)
   ```bash
   npm install -g vercel
   ```

2. **Deploy via Vercel Dashboard**
   - Go to [https://vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Vercel will auto-detect settings from `vercel.json`
   - Click **Deploy**

3. **Deploy via CLI**
   ```bash
   cd /path/to/ContributionTracker-Pro
   vercel
   ```

4. **Configure Environment Variables** (Optional)
   - Go to Project Settings > Environment Variables
   - Add Firebase config variables (see [Environment Variables](#environment-variables))
   - Redeploy for changes to take effect

### Vercel Configuration

The `vercel.json` file is already configured with:
- ✅ SPA routing (all routes → index.html)
- ✅ Service Worker support
- ✅ Optimal caching headers
- ✅ Security headers (CSP, XSS protection)

---

## Firebase Hosting

Alternative deployment using Firebase Hosting.

### Setup

1. **Install Firebase CLI**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**
   ```bash
   firebase login
   ```

3. **Initialize Firebase Hosting** (already done)
   ```bash
   firebase init hosting
   ```

4. **Deploy**
   ```bash
   npm run deploy
   # or
   firebase deploy --only hosting
   ```

5. **Your app will be live at:**
   ```
   https://contribution-tracker-pro.web.app
   ```

---

## Environment Variables

### Firebase Configuration

The app works out-of-the-box with hardcoded Firebase credentials (for development convenience).

For production or multi-environment deployments, you can override with environment variables:

#### Vercel Environment Variables

Go to: **Project Settings > Environment Variables**

Add these variables:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXX
```

#### Local Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Firebase credentials in `.env`

3. Run dev server:
   ```bash
   npm run dev
   ```

**Note:** `.env` is gitignored and won't be committed to your repository.

---

## Post-Deployment Setup

### 1. Deploy Firestore Security Rules

**IMPORTANT:** Deploy security rules to protect your data!

```bash
firebase deploy --only firestore:rules
```

The `firestore.rules` file contains production-ready security rules.

### 2. Configure Firebase Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Authentication > Sign-in method**
4. Enable **Email/Password** authentication
5. Add your Vercel domain to **Authorized domains**:
   - Example: `your-app.vercel.app`

### 3. Update Firebase Authorized Domains

1. Go to **Authentication > Settings**
2. Under **Authorized domains**, add:
   - `your-app.vercel.app` (your Vercel domain)
   - `localhost` (for local development)

### 4. Verify Firestore Indexes

If you get "missing index" errors:

```bash
firebase deploy --only firestore:indexes
```

Or create indexes from the Firebase Console when prompted.

---

## Troubleshooting

### Issue: "Firebase not initialized" error

**Solution:**
- Check that Firebase credentials are correct
- Verify `firebase-config.js` is loaded before other modules
- Check browser console for specific Firebase errors

### Issue: Authentication not working

**Solution:**
- Verify Email/Password auth is enabled in Firebase Console
- Check that your domain is in Authorized domains list
- Clear browser cache and cookies

### Issue: "Permission denied" on Firestore

**Solution:**
- Deploy security rules: `firebase deploy --only firestore:rules`
- Verify user is authenticated
- Check Firestore rules allow the operation

### Issue: PWA not updating

**Solution:**
- Service Worker caching issue
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear site data in browser DevTools
- Update version in `manifest.json`

### Issue: Vercel deployment fails

**Solution:**
- Check build logs in Vercel dashboard
- Verify `vercel.json` is valid JSON
- Ensure all dependencies in `package.json` are installed
- Check Node.js version compatibility

### Issue: Blank page after deployment

**Solution:**
- Check browser console for errors
- Verify all asset paths are relative (no absolute paths)
- Check `vercel.json` routing configuration
- Ensure Firebase config is correct

---

## Performance Tips

### 1. Enable Firestore Caching

Already enabled in `firebase-config.js`:
```javascript
localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
})
```

### 2. Service Worker Optimization

The `sw.js` file provides:
- Offline support
- Asset caching
- Fast page loads

### 3. Vercel Edge Network

Vercel automatically serves your app via CDN for:
- Global low latency
- Fast TTFB (Time To First Byte)
- Automatic HTTPS

---

## Monitoring & Analytics

### Firebase Analytics

Already configured via `measurementId` in config.

View analytics at:
[https://console.firebase.google.com/](https://console.firebase.google.com/) > Analytics

### Vercel Analytics

Enable in Vercel dashboard:
- Go to Project Settings > Analytics
- Enable Vercel Analytics (optional, paid feature)

---

## Support

For issues or questions:
- 📧 Email: innovationshamster@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/hamisi00/ContributionTracker-Pro/issues)
- 📚 Firebase Docs: [https://firebase.google.com/docs](https://firebase.google.com/docs)
- 📚 Vercel Docs: [https://vercel.com/docs](https://vercel.com/docs)

---

## Quick Reference

### Commands

```bash
# Local development
npm run dev

# Deploy to Firebase
npm run deploy

# Deploy to Vercel
vercel

# Deploy security rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

### URLs

- **Firebase Console:** https://console.firebase.google.com/
- **Vercel Dashboard:** https://vercel.com/dashboard
- **Local Dev:** http://localhost:8080

---

*Last Updated: August 2026*

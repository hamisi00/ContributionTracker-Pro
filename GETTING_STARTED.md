# ContributionTracker Pro - Getting Started Guide

## Overview
ContributionTracker Pro is a Progressive Web App (PWA) for tracking financial contributions toward common goals with flexible fund management. It uses Firebase for authentication, cloud storage, and multi-user collaboration.

---

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A Firebase account ([firebase.google.com](https://firebase.google.com))
- A code editor (VS Code, Sublime, etc.)

---

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `firebase` - Firebase SDK for authentication and Firestore
- `http-server` - Local development server

### 2. Configure Firebase

#### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard
4. Enable **Google Analytics** (optional)

#### Step 2: Enable Firestore Database

1. In your Firebase project, go to **Firestore Database**
2. Click "Create database"
3. Choose **Production mode** or **Test mode**
   - Production mode: Requires security rules (recommended)
   - Test mode: Open for 30 days (for development only)
4. Select a location (choose the closest to your users)

#### Step 3: Enable Authentication

1. Go to **Authentication** → **Sign-in method**
2. Enable **Email/Password** authentication
3. Save

#### Step 4: Get Your Firebase Configuration

1. Go to **Project Settings** (gear icon)
2. Scroll down to "Your apps"
3. Click the **Web** icon (`</>`) to add a web app
4. Register your app with a nickname (e.g., "ContributionTracker Pro")
5. Copy the Firebase configuration object

#### Step 5: Update firebase-config.js

Open `firebase-config.js` and replace the placeholder values with your actual Firebase credentials:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",              // Replace with your actual API key
    authDomain: "your-project.firebaseapp.com", // Replace with your auth domain
    projectId: "your-project-id",              // Replace with your project ID
    storageBucket: "your-project.appspot.com", // Replace with your storage bucket
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // Replace with sender ID
    appId: "YOUR_APP_ID"                       // Replace with your app ID
};
```

### 3. Deploy Firestore Security Rules

Deploy the security rules to protect your database:

```bash
firebase deploy --only firestore:rules
```

**Important:** Review `firestore.rules` to ensure they meet your security requirements.

---

## Running Locally

### Development Server

To run the app locally with hot-reload:

```bash
npm run dev
```

This will:
- Start an HTTP server on `http://localhost:8080`
- Automatically open the app in your default browser
- Serve the app with proper CORS headers for ES6 modules

### Simple Server (No Auto-Open)

```bash
npm run serve
```

Access the app at: `http://localhost:8080`

---

## Deploying to Firebase Hosting

### Initial Firebase Setup

If you haven't already:

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project (if not already done)
firebase init hosting
```

When prompted:
- Select "Use an existing project"
- Choose your Firebase project
- Set public directory: `.` (current directory)
- Configure as single-page app: **Yes**
- Don't overwrite index.html: **No**

### Deploy to Firebase Hosting

```bash
npm run deploy
```

Or manually:

```bash
firebase deploy --only hosting
```

Your app will be live at: `https://your-project-id.web.app`

---

## First Time User Setup

### 1. Create an Account

1. Open the app in your browser
2. Click "Sign Up"
3. Enter your email and password
4. Click "Create Account"

### 2. Create an Organization

After signing up:
1. You'll be prompted to create your first organization
2. Enter organization name and description
3. Click "Create Organization"

### 3. Start Using the App

You can now:
- Create funds (allocated or open-ended)
- Add groups to funds
- Record payments and pledges
- Track expenses
- View analytics and reports

---

## Project Structure

```
ContributionTracker-Pro/
├── index.html              # Main HTML file
├── auth.html              # Authentication page
├── styles.css             # Application styles
├── manifest.json          # PWA manifest
├── sw.js                  # Service Worker
│
├── Firebase Integration
│   ├── firebase-config.js      # Firebase configuration
│   ├── firebase-auth.js        # Authentication logic
│   ├── organization-manager.js # Organization management
│   ├── firestore-service.js    # Firestore data operations
│   ├── firestore-adapter.js    # Adapter for legacy DB API
│   └── app-init.js             # App initialization
│
├── Application Logic
│   ├── app.js             # Main application logic
│   ├── db-manager.js      # Local IndexedDB manager
│   ├── modules.js         # Utility modules
│   ├── api-service.js     # API service
│   └── seed-data.js       # Sample data for testing
│
└── Configuration
    ├── package.json       # npm configuration
    ├── firebase.json      # Firebase configuration
    ├── firestore.rules    # Firestore security rules
    └── .firebaseignore    # Files to ignore in deployment
```

---

## Key Features

### Multi-Organization Support
- Create multiple organizations
- Switch between organizations
- Invite users with different roles (Owner, Admin, Member, Viewer)

### Fund Management
- **Allocated Funds**: Set a goal and track progress
- **Open-Ended Funds**: Track collections without a specific goal
- Multiple groups within each fund
- Automatic calculations and progress tracking

### Payment Tracking
- Record actual payments
- Track pledges (future commitments)
- Filter and search payment history
- Export payment data

### Expense Management
- Categorized expenses (Supplies, Maintenance, Utilities, etc.)
- Date range filtering
- Vendor tracking
- Total expense calculations

### Analytics & Reporting
- Visual charts and graphs
- Fund performance metrics
- Top contributors
- Collections vs. Expenses trends
- Monthly summaries

### PWA Features
- Offline support with Service Worker
- Install as standalone app
- Fast loading with caching
- Push notifications (coming soon)

---

## Troubleshooting

### CORS Errors When Opening index.html Directly

**Problem:** Opening `index.html` via `file://` protocol causes module loading errors.

**Solution:** Always use a development server:
```bash
npm run serve
```

### Firebase Not Initialized

**Problem:** Console shows "Firebase not initialized" errors.

**Solution:**
1. Check that you've updated `firebase-config.js` with your actual credentials
2. Ensure Firebase SDK is loading properly (check browser console)
3. Verify your Firebase project is active

### Authentication Errors

**Problem:** Can't sign up or sign in.

**Solution:**
1. Verify Email/Password authentication is enabled in Firebase Console
2. Check browser console for specific error messages
3. Ensure you're using valid email format and password (6+ characters)

### Firestore Permission Denied

**Problem:** "Permission denied" when accessing data.

**Solution:**
1. Deploy Firestore security rules: `firebase deploy --only firestore:rules`
2. Ensure you're authenticated
3. Check that rules allow your user to access the data

---

## Support & Documentation

- **Firebase Documentation**: [firebase.google.com/docs](https://firebase.google.com/docs)
- **Firestore Guide**: [firebase.google.com/docs/firestore](https://firebase.google.com/docs/firestore)
- **Firebase Authentication**: [firebase.google.com/docs/auth](https://firebase.google.com/docs/auth)

---

## License

MIT License - See LICENSE file for details

---

**Happy Contributing!** 🎉

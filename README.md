# ContributionTracker Pro

A modern Progressive Web App (PWA) for tracking financial contributions toward common goals with flexible fund management, multi-organization support, and real-time Firebase integration.

---

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Deploy to Firebase Hosting
npm run deploy
```

**📖 For detailed setup instructions, see [GETTING_STARTED.md](./GETTING_STARTED.md)**

---

## Features

### Core Functionality
- ✅ **Two Fund Types**
  - **Allocated Funds**: Fixed budget with specific group allocations
  - **Open Funds**: Ongoing collections without predetermined targets

- ✅ **Group Management**
  - Add, rename, and manage contribution groups
  - Assign allocations for allocated funds
  - Track progress per group

- ✅ **Payment Recording**
  - Detailed payment information (amount, date, payer, method, reference, notes)
  - **Pledge Tracking**: Separate tracking for pledges vs actual payments
  - Instant progress updates
  - Complete payment history per group

- ✅ **Expense Management**
  - Record expenses with categories (utilities, maintenance, etc.)
  - Track expense amounts, dates, vendors, and payment methods
  - Complete expense history

- ✅ **Analytics & Reporting**
  - Visual charts showing collection vs expenses trends
  - Dashboard with key metrics and statistics
  - Fund performance analysis

- ✅ **Flexible Fund Management**
  - Switch between Allocated and Open fund types
  - Sort groups by contribution amount, recent payments, or alphabetically
  - Visual progress bars and statistics

- ✅ **Data Export & Sync**
  - Export individual funds to CSV
  - Export all data for backup
  - Generate comprehensive reports
  - **Google Sheets Integration**: Optional cloud sync and backup

### PWA Features
- ✅ **Offline First**: Works completely offline with IndexedDB storage
- ✅ **Installable**: Can be installed on mobile and desktop devices
- ✅ **Responsive Design**: Works perfectly on phones, tablets, and computers
- ✅ **Dark Mode**: Toggle between light and dark themes
- ✅ **Fast & Lightweight**: No framework dependencies

## Installation

### Option 1: Use Online (Hosted via Firebase)
1. Visit your Firebase hosting URL: `https://your-project-id.web.app`
2. Click the "Install" button in your browser (Chrome, Edge, Safari)
3. The app will be added to your home screen/app menu

### Option 2: Run Locally for Development
1. Clone this repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Open `http://localhost:8080` in your browser

**⚠️ Important:** Do NOT open `index.html` directly via `file://` protocol. ES6 modules require HTTP(S) protocol. Always use the development server.

## Quick Start Guide

### 1. Customize Your App
- Go to **Settings** → Enter your preferred app name
- Choose light or dark theme

### 2. Create Your First Fund
- Click **"New Fund"** button
- Enter fund name and description
- Choose fund type:
  - **Allocated**: Set a total goal (e.g., $10,000 for a new roof)
  - **Open**: No fixed goal (e.g., ongoing donations)

### 3. Add Groups
- Open your fund
- Click **"Add Group"**
- For Allocated Funds: Assign a portion of the total goal to each group
- For Open Funds: Just add group names

### 4. Record Payments
- Click **"Add Payment"**
- Select the group
- Enter payment details (amount, date, payer, method)
- Submit

### 5. Track Progress
- View real-time progress bars
- Sort groups by contribution amount or recent activity
- Export fund data anytime

## User Guide

### Fund Types Explained

#### Allocated Funds
Perfect for projects with a specific budget:
- Set a total goal amount
- Divide the goal among groups
- Track how much each group has contributed vs. their allocation
- Visual progress bars show completion status

**Example**: "New Roof Project - $50,000"
- East Wing Residents: $15,000 allocated
- West Wing Residents: $20,000 allocated
- North Wing Residents: $15,000 allocated

#### Open Funds
Ideal for ongoing collections:
- No fixed goal
- Simply track contributions from each group
- See total collected across all groups

**Example**: "Community Charity Drive"
- Various donors
- No specific target
- Track all contributions

### Switching Fund Types
You can switch a fund from Allocated to Open (or vice versa) at any time:
- Open the fund detail page
- Click **"Switch Type"**
- The app will automatically adjust the data structure

### Sorting Options
Sort groups in any fund by:
- **Alphabetical**: A-Z order
- **Most Contributed**: Highest to lowest amount paid
- **Least Contributed**: Lowest to highest amount paid
- **Most Recent**: Groups with recent payments first

### Exporting Data

#### Export Single Fund (CSV)
- Open the fund
- Click **"Export"**
- Downloads a CSV with all payments for that fund
- Includes: Fund name, Group, Amount, Date, Payer, Method, Reference, Notes

#### Export All Data (JSON)
- Go to **Settings**
- Click **"Export All Data"**
- Downloads complete backup as JSON
- Includes: All funds, groups, payments, and settings

#### Generate Reports
- Go to **Reports** section
- **Fund Summary Report**: Overview of all funds and their progress
- **Payment History Report**: Detailed payment records across all funds


## Technical Details

### Architecture
- **Frontend**: Modern ES6 JavaScript modules
- **Storage**:
  - Firebase Firestore (cloud database)
  - IndexedDB (local offline cache)
- **Authentication**: Firebase Authentication (Email/Password)
- **Organizations**: Multi-organization support with role-based access
- **Offline**: Service Worker with Firestore offline persistence
- **Styling**: CSS Custom Properties with dark mode support
- **Hosting**: Firebase Hosting for production deployment

### Browser Compatibility
- Chrome 80+
- Edge 80+
- Firefox 75+
- Safari 13+
- Mobile browsers (iOS Safari, Chrome Android)

### Data Storage

**Local Storage (IndexedDB)**:
- Primary data storage for offline-first functionality
- All CRUD operations work with IndexedDB directly
- Fast, reliable, works completely offline
- Stores: Funds, Groups, Payments, Expenses, Settings

**Cloud Backup (Google Sheets)** - Optional:
- Optional cloud backup via Google Apps Script
- Manual sync for data backup
- Export/import functionality

### File Structure
```
ContributionTracker-Pro/
├── index.html                  # Main app shell
├── auth.html                   # Authentication page
├── manifest.json               # PWA configuration
├── sw.js                       # Service worker (offline functionality)
├── styles.css                  # Complete styling
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
│   ├── app.js                  # Main application logic
│   ├── db-manager.js           # Local IndexedDB manager (legacy)
│   ├── modules.js              # Utility functions
│   ├── api-service.js          # API service layer
│   └── seed-data.js            # Sample data for testing
│
├── Configuration
│   ├── package.json            # npm dependencies
│   ├── firebase.json           # Firebase configuration
│   ├── firestore.rules         # Firestore security rules
│   ├── .firebaseignore         # Deployment ignore patterns
│   └── .firebaserc             # Firebase project config
│
├── Documentation
│   ├── README.md               # This file
│   └── GETTING_STARTED.md      # Detailed setup guide
│
├── icons/                      # PWA icons (various sizes)
└── node_modules/               # Dependencies
```

## Privacy & Security

### Data Privacy

- All data stays on your device in IndexedDB
- No cloud storage by default
- No tracking, no analytics, no cookies
- No internet required - works completely offline
- Optional Google Sheets sync for cloud backup

### Security

**Local Storage**:
- Data stored in browser's secure IndexedDB
- Per-origin isolation (browser security model)
- No authentication required for local-only mode

**Best Practices**:
- Export data regularly as backup
- Keep backups in a secure location
- Be cautious when using shared/public computers

## Troubleshooting

### App not installing?
- Ensure you're using HTTPS (or localhost)
- Check browser compatibility
- Clear browser cache and try again

### Data not saving?
- Check browser storage permissions
- Ensure sufficient storage space
- Try a different browser

### Offline mode not working?
- Wait for service worker to install (first visit)
- Refresh the page once after installation
- Check browser console for errors

### Can't see my data on another device?
- Data is stored per device/browser
- Use Export All Data to backup
- Manually import on other devices (future feature)

## Keyboard Shortcuts
- `Ctrl/Cmd + K`: Quick search (future feature)
- `Ctrl/Cmd + N`: New fund (future feature)

## Roadmap

### Phase 1 (Complete - v1.1)
- ✅ Core fund management
- ✅ Payment tracking with pledge support
- ✅ Expense management
- ✅ Analytics and reporting
- ✅ Data export
- ✅ Offline functionality
- ✅ Dark mode
- ✅ Google Sheets sync (optional cloud backup)

### Phase 2 (Planned)
- 🔄 Organization member invitation system (via email)
- 🔄 Member management UI (add/remove/change roles)
- 🔄 Enhanced analytics with custom date ranges
- 🔄 Activity logs and audit trail
- 🔄 Email notifications for payments/expenses

### Phase 3 (Future)
- 📅 Nested hub ecosystem (parent/child apps)
- 📅 Fund transfer between apps
- 📅 Overseer admin app for hierarchy management
- 📅 Advanced analytics and charts
- 📅 Push notifications
- 📅 Multi-currency support
- 📅 Receipt scanning and attachment support
- 📅 Scheduled reports
- 📅 Real-time sync (currently manual refresh)

## FAQ

**Q: Is this free?**
A: Yes, completely free and open source.

**Q: Do I need an account?**
A: No, the app works entirely offline without any account.

**Q: Can I use this offline?**
A: Yes! The app works completely offline.

**Q: How do I backup my data?**
A: Settings → Export All Data. Optionally, you can use Google Sheets integration for cloud backup.

**Q: Can I sync across devices?**
A: Yes! Two options:
1. **Google Sheets integration** - cloud backup and sync
2. **Export/Import** - manual backup and transfer

**Q: What happens if I clear browser data?**
A: Local data will be lost. Export regularly as backup.

**Q: How do I update the app?**
A: Refresh the page. Service worker will automatically update to the latest version.

**Q: What's the difference between pledges and payments?**
A: Pledges are commitments to pay in the future, while payments are actual funds received. The app tracks both separately, and remaining/exceeded calculations are based only on actual payments, not pledges.

**Q: How do pledges work?**
A: When recording a payment, mark it as a "pledge" if the funds haven't been received yet. Pledges appear in purple on progress bars, while actual payments appear in green/blue. This helps you track both commitments and actual collections separately.

**Q: How do I sync with Google Sheets?**
A: Deploy the google-apps-script.js file as a Google Apps Script Web App, configure the script with your Spreadsheet ID, and use the Sync feature in Settings to connect your app to Google Sheets for cloud backup and sync.

## Support

### Issues
- Check this README first
- Review the implementation plan: `ContributionTracker_Pro_Implementation_Plan.md`
- Check browser console for error messages

### Contributing
This is a standalone PWA project. Feel free to:
- Fork and customize for your needs
- Add new features
- Improve the design
- Fix bugs

## License
MIT License - Feel free to use, modify, and distribute.

## Credits
- Design inspired by modern PWA best practices
- Icons: Unicode emoji (no external dependencies)
- Built with vanilla JavaScript for maximum compatibility

---

**Version**: 1.1.0
**Last Updated**: December 2025
**Status**: Production Ready (Phase 1 Complete + Google Sheets Integration)

---

## Getting Started Checklist

- [ ] Open the app in your browser
- [ ] Install as PWA (optional)
- [ ] Go to Settings and set your app name
- [ ] Create your first fund
- [ ] Add groups to the fund
- [ ] Record your first payment
- [ ] Explore sorting and filtering options
- [ ] Export a fund to CSV
- [ ] Try offline mode (disable network)
- [ ] Test dark mode
- [ ] Set up Google Sheets sync (optional)

Enjoy tracking your contributions! 💰

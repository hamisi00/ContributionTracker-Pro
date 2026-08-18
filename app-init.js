// App Initialization
// ContributionTracker Pro - Firebase Initialization & Auth State Management

import { initializeFirebase } from './firebase-config.js';
import {
    onAuthStateChange,
    getCurrentUser,
    isAuthenticated
} from './firebase-auth.js';
import {
    getMyOrganizations,
    getOrganization
} from './organization-manager.js';
import FirestoreAdapter from './firestore-adapter.js';

// ==========================================
// STATE MANAGEMENT
// ==========================================

let currentOrganization = null;
let userOrganizations = [];
let appInitialized = false;
let firestoreAdapter = null;

// ==========================================
// INITIALIZATION
// ==========================================

/**
 * Initialize the application
 */
export async function initializeApp() {
    if (appInitialized) {
        console.log('� App already initialized');
        return;
    }

    console.log('=� Initializing ContributionTracker Pro...');

    try {
        // Initialize Firebase
        console.log('=� Initializing Firebase...');
        await initializeFirebase();
        console.log(' Firebase initialized');

        // Set up auth state listener
        setupAuthStateListener();

        appInitialized = true;
        console.log(' App initialization complete');

    } catch (error) {
        console.error('L App initialization error:', error);
        showError('Failed to initialize app. Please refresh the page.');
    }
}

/**
 * Set up authentication state listener
 */
function setupAuthStateListener() {
    onAuthStateChange(async (user) => {
        console.log('= Auth state changed:', user ? 'User logged in' : 'User logged out');

        if (user) {
            // User is authenticated
            await handleAuthenticatedUser(user);
        } else {
            // User is not authenticated, redirect to auth page
            handleUnauthenticatedUser();
        }
    });
}

/**
 * Handle authenticated user
 */
async function handleAuthenticatedUser(user) {
    try {
        console.log('=d Loading user data...');

        // Load user's organizations
        userOrganizations = await getMyOrganizations();
        console.log(` Loaded ${userOrganizations.length} organizations`);

        if (userOrganizations.length === 0) {
            // No organizations, redirect to setup
            console.log('� No organizations found, redirecting to setup...');
            window.location.href = 'auth.html#setup';
            return;
        }

        // Get current organization (first one or from user preference)
        const orgId = user.currentOrganization || userOrganizations[0].id;
        currentOrganization = await getOrganization(orgId);

        if (!currentOrganization) {
            console.warn('� Could not load current organization');
            currentOrganization = userOrganizations[0];
        }

        console.log(' Current organization:', currentOrganization.name);

        // Initialize Firestore adapter
        console.log('Initializing Firestore adapter...');
        firestoreAdapter = new FirestoreAdapter();
        await firestoreAdapter.initialize(currentOrganization.id);

        // Expose Firestore adapter globally for app.js
        window.FirestoreDB = firestoreAdapter;
        console.log('Firestore adapter ready');

        // Hide login container (but keep main app hidden until data loads)
        hideLoginScreen();

        // NOTE: showMainApp() is now called by app.js AFTER data is loaded
        // This ensures the app appears instantly with data already rendered
        // showMainApp(); // ← Moved to app.js init() for instant-load experience

        // Dispatch custom event for app.js and other modules to initialize
        window.dispatchEvent(new CustomEvent('appReady', {
            detail: {
                user: user,
                organization: currentOrganization,
                organizations: userOrganizations,
                firestoreAdapter: firestoreAdapter
            }
        }));

    } catch (error) {
        console.error('L Error loading user data:', error);
        showError('Failed to load user data. Please try refreshing the page.');
    }
}

/**
 * Handle unauthenticated user
 */
function handleUnauthenticatedUser() {
    // Clean up active listeners when user signs out
    if (window.app && typeof window.app.cleanupListeners === 'function') {
        window.app.cleanupListeners();
        console.log('🧹 Cleaned up real-time listeners on sign-out');
    }

    // Clear FirestoreDB reference
    if (window.FirestoreDB) {
        window.FirestoreDB = null;
    }

    // Check if we're on the auth page
    if (window.location.pathname.includes('auth.html')) {
        return;
    }

    // Show login screen or redirect to auth page
    const loginContainer = document.getElementById('loginContainer');
    if (loginContainer) {
        showLoginScreen();
        hideMainApp();
    } else {
        // Redirect to auth page
        console.log('= User not authenticated, redirecting to auth page...');
        window.location.href = 'auth.html';
    }
}

/**
 * Show login screen
 */
function showLoginScreen() {
    const loginContainer = document.getElementById('loginContainer');
    if (loginContainer) {
        loginContainer.classList.remove('hidden');
        loginContainer.style.display = 'flex';
    }
}

/**
 * Hide login screen
 */
function hideLoginScreen() {
    const loginContainer = document.getElementById('loginContainer');
    if (loginContainer) {
        loginContainer.classList.add('hidden');
        loginContainer.style.display = 'none';
    }
}

/**
 * Show main app
 */
function showMainApp() {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.style.display = 'block';
    }

    const mainApp = document.getElementById('mainApp') || document.querySelector('.dashboard');
    if (mainApp) {
        mainApp.classList.remove('hidden');
        mainApp.style.display = 'block';
    }
}

/**
 * Hide main app
 */
function hideMainApp() {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.style.display = 'none';
    }

    const mainApp = document.getElementById('mainApp') || document.querySelector('.dashboard');
    if (mainApp) {
        mainApp.classList.add('hidden');
        mainApp.style.display = 'none';
    }
}

/**
 * Show error message
 */
function showError(message) {
    // Try to use toast notification if available
    if (typeof window.showToast === 'function') {
        window.showToast(message, 'error');
    } else {
        // Fallback to alert
        alert(message);
    }
}

// ==========================================
// PUBLIC API
// ==========================================

/**
 * Get current organization
 */
export function getCurrentOrganization() {
    return currentOrganization;
}

/**
 * Get user organizations
 */
export function getUserOrganizations() {
    return userOrganizations;
}

/**
 * Switch to a different organization
 */
export async function switchOrganization(orgId) {
    try {
        console.log('= Switching organization:', orgId);

        const org = await getOrganization(orgId);
        if (!org) {
            throw new Error('Organization not found');
        }

        currentOrganization = org;
        console.log(' Switched to organization:', org.name);

        // Reinitialize app with new organization
        if (typeof window.app !== 'undefined' && window.app.initialize) {
            window.app.initialize(currentOrganization);
        }

        // Dispatch event
        window.dispatchEvent(new CustomEvent('organizationChanged', {
            detail: { organization: currentOrganization }
        }));

        // Reload the page to refresh all data
        window.location.reload();

    } catch (error) {
        console.error('L Error switching organization:', error);
        showError('Failed to switch organization. Please try again.');
    }
}

/**
 * Check if app is initialized
 */
export function isAppInitialized() {
    return appInitialized;
}

// ==========================================
// AUTO-INITIALIZE ON LOAD
// ==========================================

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM is already ready
    initializeApp();
}

// ==========================================
// EXPORT DEFAULT
// ==========================================

export default {
    initializeApp,
    getCurrentOrganization,
    getUserOrganizations,
    switchOrganization,
    isAppInitialized
};

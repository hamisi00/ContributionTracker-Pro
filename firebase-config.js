// Firebase Configuration
// ContributionTracker Pro - Firebase Setup and Initialization

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
    initializeFirestore,
    connectFirestoreEmulator,
    persistentLocalCache,
    persistentMultipleTabManager
} from 'firebase/firestore';

// ==========================================
// CONFIGURATION
// ==========================================

/**
 * Firebase Configuration
 *
 * This configuration supports both environment variables and hardcoded values:
 * - Environment variables (VITE_FIREBASE_*) override hardcoded values
 * - Hardcoded values serve as fallback for easy local development
 *
 * For Vercel deployment:
 * Set environment variables in Vercel dashboard or use .env file
 *
 * Get these from: https://console.firebase.google.com/
 * Project Settings > General > Your apps > Firebase SDK snippet > Config
 */

// Helper to get environment variable (works with Vite, Vercel, and plain JS)
const getEnv = (key) => {
    // Check import.meta.env (Vite)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        return import.meta.env[key];
    }
    // Check process.env (Node.js / Vercel build-time)
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key];
    }
    return undefined;
};

const firebaseConfig = {
    apiKey: getEnv('VITE_FIREBASE_API_KEY') || "AIzaSyDHERpP1bAXccOW7hK7JzqS5CLHp7gQKek",
    authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || "contribution-tracker-pro.firebaseapp.com",
    projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || "contribution-tracker-pro",
    storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || "contribution-tracker-pro.firebasestorage.app",
    messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || "533151463891",
    appId: getEnv('VITE_FIREBASE_APP_ID') || "1:533151463891:web:2df17d32f1b81e98e29726",
    measurementId: getEnv('VITE_FIREBASE_MEASUREMENT_ID') || "G-YHTWJMCJBV"
};

// ==========================================
// COLLECTION NAMES
// ==========================================

export const COLLECTIONS = {
    USERS: 'users',
    ORGANIZATIONS: 'organizations',
    INVITATIONS: 'invitations',
    ACTIVITY_LOGS: 'activityLogs'
};

export const SUBCOLLECTIONS = {
    FUNDS: 'funds',
    EXPENSES: 'expenses',
    SETTINGS: 'settings'  // User-specific settings
};

export const FUND_SUBCOLLECTIONS = {
    GROUPS: 'groups',
    PAYMENTS: 'payments'
};

// ==========================================
// ROLES
// ==========================================

export const ROLES = {
    OWNER: 'owner',
    ADMIN: 'admin',
    MEMBER: 'member',
    VIEWER: 'viewer'
};

// Role hierarchy (higher number = more permissions)
const ROLE_HIERARCHY = {
    viewer: 1,
    member: 2,
    admin: 3,
    owner: 4
};

/**
 * Check if user has minimum required role
 * @param {string} userRole - User's current role
 * @param {string} requiredRole - Minimum required role
 * @returns {boolean}
 */
export function hasMinimumRole(userRole, requiredRole) {
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
}

// ==========================================
// FIREBASE INITIALIZATION
// ==========================================

let app = null;
let auth = null;
let db = null;
let initialized = false;

/**
 * Initialize Firebase
 * @param {Object} options - Optional configuration overrides
 * @returns {Promise<void>}
 */
export async function initializeFirebase(options = {}) {
    if (initialized) {
        console.log('🔥 Firebase already initialized');
        return;
    }

    try {
        console.log('🔥 Initializing Firebase...');

        // Merge custom config if provided
        const config = options.config || firebaseConfig;

        // Initialize Firebase App
        app = initializeApp(config);
        console.log('✅ Firebase app initialized');

        // Initialize Auth
        auth = getAuth(app);
        console.log('✅ Firebase Auth initialized');

        // Initialize Firestore with persistent cache (modern API)
        if (options.enablePersistence !== false) {
            db = initializeFirestore(app, {
                localCache: persistentLocalCache({
                    tabManager: persistentMultipleTabManager()
                })
            });
            console.log('✅ Firestore initialized with persistent cache (multi-tab support)');
        } else {
            db = initializeFirestore(app, {});
            console.log('✅ Firestore initialized (persistence disabled)');
        }

        // Connect to emulators if in development
        if (options.useEmulator && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
            connectAuthEmulator(auth, 'http://localhost:9099');
            connectFirestoreEmulator(db, 'localhost', 8080);
            console.log('🔧 Connected to Firebase emulators');
        }

        initialized = true;
        console.log('🎉 Firebase initialization complete');

    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
        throw error;
    }
}

/**
 * Get Firebase Auth instance
 * @returns {Auth}
 */
export function getFirebaseAuth() {
    if (!initialized || !auth) {
        throw new Error('Firebase not initialized. Call initializeFirebase() first.');
    }
    return auth;
}

/**
 * Get Firestore instance
 * @returns {Firestore}
 */
export function getFirebaseDb() {
    if (!initialized || !db) {
        throw new Error('Firebase not initialized. Call initializeFirebase() first.');
    }
    return db;
}

/**
 * Check if Firebase is initialized
 * @returns {boolean}
 */
export function isFirebaseInitialized() {
    return initialized;
}

// ==========================================
// ERROR HANDLING
// ==========================================

/**
 * Get user-friendly error message from Firebase error
 * @param {Error} error - Firebase error object
 * @returns {string}
 */
export function getFirebaseErrorMessage(error) {
    const errorCode = error.code || '';

    const errorMessages = {
        // Auth errors
        'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/operation-not-allowed': 'This operation is not allowed. Please contact support.',
        'auth/weak-password': 'Password is too weak. Use at least 6 characters.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your internet connection.',
        'auth/requires-recent-login': 'Please log in again to complete this action.',

        // Firestore errors
        'permission-denied': 'You do not have permission to perform this action.',
        'unavailable': 'Service is currently unavailable. Please try again.',
        'not-found': 'The requested resource was not found.',
        'already-exists': 'This resource already exists.',
        'resource-exhausted': 'Quota exceeded. Please try again later.',
        'failed-precondition': 'Operation failed. Please check your data.',
        'aborted': 'Operation was aborted. Please try again.',
        'out-of-range': 'Invalid operation parameters.',
        'unimplemented': 'This operation is not implemented.',
        'internal': 'Internal error occurred. Please try again.',
        'data-loss': 'Data loss or corruption detected.',
        'unauthenticated': 'You must be logged in to perform this action.'
    };

    return errorMessages[errorCode] || error.message || 'An unexpected error occurred.';
}

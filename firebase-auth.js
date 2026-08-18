// Firebase Authentication
// ContributionTracker Pro - User Authentication and Management

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    updateProfile,
    onAuthStateChanged,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider
} from 'firebase/auth';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
    arrayUnion
} from 'firebase/firestore';

import { getFirebaseAuth, getFirebaseDb, COLLECTIONS, getFirebaseErrorMessage } from './firebase-config.js';

// ==========================================
// AUTHENTICATION FUNCTIONS
// ==========================================

/**
 * Sign up a new user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} displayName - User's display name
 * @returns {Promise<object>} User object
 */
export async function signUp(email, password, displayName) {
    try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDb();

        // Create user with email and password
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update user profile with display name
        await updateProfile(user, { displayName });

        // Create user document in Firestore
        const userDocRef = doc(db, COLLECTIONS.USERS, user.uid);
        await setDoc(userDocRef, {
            uid: user.uid,
            email: user.email,
            displayName: displayName || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            organizations: [], // Will be populated when user creates/joins organizations
            currentOrganization: null,
            lastLogin: serverTimestamp()
        });

        console.log('✅ User signed up:', user.email);
        return {
            success: true,
            data: {
                uid: user.uid,
                email: user.email,
                displayName: displayName
            }
        };

    } catch (error) {
        console.error('❌ Sign up error:', error);
        return {
            success: false,
            error: getFirebaseErrorMessage(error)
        };
    }
}

/**
 * Sign in existing user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<object>} User object
 */
export async function signIn(email, password) {
    try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDb();

        // Sign in user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update last login time
        const userDocRef = doc(db, COLLECTIONS.USERS, user.uid);
        await updateDoc(userDocRef, {
            lastLogin: serverTimestamp()
        });

        console.log('✅ User signed in:', user.email);
        return {
            success: true,
            data: {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName
            }
        };

    } catch (error) {
        console.error('❌ Sign in error:', error);
        return {
            success: false,
            error: getFirebaseErrorMessage(error)
        };
    }
}

/**
 * Sign out current user
 * @returns {Promise<void>}
 */
export async function signOutUser() {
    try {
        const auth = getFirebaseAuth();
        await signOut(auth);
        console.log('✅ User signed out');
        return { success: true };
    } catch (error) {
        console.error('❌ Sign out error:', error);
        return {
            success: false,
            error: getFirebaseErrorMessage(error)
        };
    }
}

/**
 * Send password reset email
 * @param {string} email - User email
 * @returns {Promise<void>}
 */
export async function resetPassword(email) {
    try {
        const auth = getFirebaseAuth();
        await sendPasswordResetEmail(auth, email);
        console.log('✅ Password reset email sent to:', email);
        return { success: true };
    } catch (error) {
        console.error('❌ Password reset error:', error);
        return {
            success: false,
            error: getFirebaseErrorMessage(error)
        };
    }
}

// ==========================================
// USER STATE MANAGEMENT
// ==========================================

/**
 * Listen to authentication state changes
 * @param {Function} callback - Callback function(user)
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
    try {
        const auth = getFirebaseAuth();
        return onAuthStateChanged(auth, async (user) => {
            if (user) {
                // User is signed in, get additional data from Firestore
                const userData = await getUserData(user.uid);
                callback({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    ...userData
                });
            } else {
                // User is signed out
                callback(null);
            }
        });
    } catch (error) {
        console.error('❌ Auth state listener error:', error);
        callback(null);
    }
}

/**
 * Get current authenticated user
 * @returns {object|null} Current user or null
 */
export function getCurrentUser() {
    try {
        const auth = getFirebaseAuth();
        const user = auth.currentUser;

        if (user) {
            return {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName
            };
        }

        return null;
    } catch (error) {
        console.error('❌ Get current user error:', error);
        return null;
    }
}

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export function isAuthenticated() {
    try {
        const auth = getFirebaseAuth();
        return auth.currentUser !== null;
    } catch (error) {
        return false;
    }
}

// ==========================================
// USER PROFILE MANAGEMENT
// ==========================================

/**
 * Get user data from Firestore
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} User data
 */
export async function getUserData(userId) {
    try {
        const db = getFirebaseDb();
        const userDocRef = doc(db, COLLECTIONS.USERS, userId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            return userDoc.data();
        }

        return null;
    } catch (error) {
        console.error('❌ Get user data error:', error);
        return null;
    }
}

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {object} updates - Profile updates
 * @returns {Promise<boolean>}
 */
export async function updateUserProfile(userId, updates) {
    try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDb();
        const currentUser = auth.currentUser;

        if (!currentUser || currentUser.uid !== userId) {
            throw new Error('User not authenticated');
        }

        // Update Firebase Auth profile if displayName changed
        if (updates.displayName) {
            await updateProfile(currentUser, {
                displayName: updates.displayName
            });
        }

        // Update Firestore user document
        const userDocRef = doc(db, COLLECTIONS.USERS, userId);
        await updateDoc(userDocRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });

        console.log('✅ User profile updated');
        return true;

    } catch (error) {
        console.error('❌ Update profile error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

/**
 * Update user email
 * @param {string} newEmail - New email address
 * @param {string} currentPassword - Current password for reauthentication
 * @returns {Promise<boolean>}
 */
export async function updateUserEmail(newEmail, currentPassword) {
    try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDb();
        const currentUser = auth.currentUser;

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Reauthenticate user
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);

        // Update email
        await updateEmail(currentUser, newEmail);

        // Update Firestore
        const userDocRef = doc(db, COLLECTIONS.USERS, currentUser.uid);
        await updateDoc(userDocRef, {
            email: newEmail,
            updatedAt: serverTimestamp()
        });

        console.log('✅ Email updated to:', newEmail);
        return true;

    } catch (error) {
        console.error('❌ Update email error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

/**
 * Update user password
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<boolean>}
 */
export async function updateUserPassword(currentPassword, newPassword) {
    try {
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Reauthenticate user
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);

        // Update password
        await updatePassword(currentUser, newPassword);

        console.log('✅ Password updated');
        return true;

    } catch (error) {
        console.error('❌ Update password error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

// ==========================================
// ORGANIZATION TRACKING
// ==========================================

/**
 * Add organization to user's organization list
 * @param {string} organizationId - Organization ID
 * @returns {Promise<boolean>}
 */
export async function addOrganizationToUser(organizationId) {
    try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDb();
        const currentUser = auth.currentUser;

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        const userDocRef = doc(db, COLLECTIONS.USERS, currentUser.uid);
        await setDoc(userDocRef, {
            organizations: arrayUnion(organizationId),
            updatedAt: serverTimestamp()
        }, { merge: true });

        console.log('✅ Organization added to user:', organizationId);
        return true;

    } catch (error) {
        console.error('❌ Add organization error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

/**
 * Set user's current organization
 * @param {string} organizationId - Organization ID
 * @returns {Promise<boolean>}
 */
export async function setCurrentOrganization(organizationId) {
    try {
        const auth = getFirebaseAuth();
        const db = getFirebaseDb();
        const currentUser = auth.currentUser;

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        const userDocRef = doc(db, COLLECTIONS.USERS, currentUser.uid);
        await updateDoc(userDocRef, {
            currentOrganization: organizationId,
            updatedAt: serverTimestamp()
        });

        console.log('✅ Current organization set:', organizationId);
        return true;

    } catch (error) {
        console.error('❌ Set current organization error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

// ==========================================
// EXPORTS
// ==========================================

export default {
    signUp,
    signIn,
    signOutUser,
    resetPassword,
    onAuthStateChange,
    getCurrentUser,
    isAuthenticated,
    getUserData,
    updateUserProfile,
    updateUserEmail,
    updateUserPassword,
    addOrganizationToUser,
    setCurrentOrganization
};

// ==========================================
// GLOBAL WINDOW EXPOSURE (for non-module scripts)
// ==========================================

// Expose auth functions to window for modules.js and other scripts
if (typeof window !== 'undefined') {
    window.firebaseAuthModule = {
        signUp,
        signIn,
        signOutUser,
        resetPassword,
        onAuthStateChange,
        getCurrentUser,
        isAuthenticated,
        getUserData,
        updateUserProfile,
        updateUserEmail,
        updateUserPassword,
        addOrganizationToUser,
        setCurrentOrganization
    };
}

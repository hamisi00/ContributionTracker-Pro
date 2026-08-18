// Organization Manager
// ContributionTracker Pro - Organization and Member Management

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    Timestamp,
    arrayUnion,
    arrayRemove
} from 'firebase/firestore';

import { getFirebaseDb, COLLECTIONS, ROLES, hasMinimumRole, getFirebaseErrorMessage } from './firebase-config.js';
import { getCurrentUser, addOrganizationToUser } from './firebase-auth.js';

// ==========================================
// ORGANIZATION CRUD
// ==========================================

/**
 * Create a new organization
 * @param {string} name - Organization name
 * @param {string} description - Organization description
 * @returns {Promise<object>} Created organization
 */
export async function createOrganization(name, description = '') {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Create organization document
        const orgRef = doc(collection(db, COLLECTIONS.ORGANIZATIONS));
        const orgId = orgRef.id;

        const organization = {
            id: orgId,
            name: name,
            description: description,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            members: [{
                userId: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName || '',
                role: ROLES.OWNER,
                joinedAt: Timestamp.now()
            }]
        };

        await setDoc(orgRef, organization);

        // Add organization to user's organizations list
        await addOrganizationToUser(orgId);

        console.log('✅ Organization created:', name);
        return { id: orgId, ...organization };

    } catch (error) {
        console.error('❌ Create organization error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

/**
 * Get organization by ID
 * @param {string} organizationId - Organization ID
 * @returns {Promise<object|null>} Organization data
 */
export async function getOrganization(organizationId) {
    try {
        const db = getFirebaseDb();
        const orgRef = doc(db, COLLECTIONS.ORGANIZATIONS, organizationId);
        const orgDoc = await getDoc(orgRef);

        if (orgDoc.exists()) {
            return { id: orgDoc.id, ...orgDoc.data() };
        }

        return null;

    } catch (error) {
        console.error('❌ Get organization error:', error);
        return null;
    }
}

/**
 * Get all organizations for current user
 * @returns {Promise<Array>} List of organizations
 */
export async function getMyOrganizations() {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            return [];
        }

        // Get organizations and filter where user is a member
        const orgsRef = collection(db, COLLECTIONS.ORGANIZATIONS);
        const allOrgsSnapshot = await getDocs(orgsRef);
        const myOrgs = [];

        allOrgsSnapshot.forEach((doc) => {
            const org = { id: doc.id, ...doc.data() };
            // Check if current user is in members array
            const isMember = org.members?.some(member => member.userId === currentUser.uid);
            if (isMember) {
                myOrgs.push(org);
            }
        });

        return myOrgs;

    } catch (error) {
        console.error('❌ Get my organizations error:', error);
        return [];
    }
}

/**
 * Update organization
 * @param {string} organizationId - Organization ID
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>}
 */
export async function updateOrganization(organizationId, updates) {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Check if user has admin/owner role
        const org = await getOrganization(organizationId);
        if (!org) {
            throw new Error('Organization not found');
        }

        const userMember = org.members?.find(m => m.userId === currentUser.uid);
        if (!userMember || !hasMinimumRole(userMember.role, ROLES.ADMIN)) {
            throw new Error('Permission denied. Admin role required.');
        }

        // Update organization
        const orgRef = doc(db, COLLECTIONS.ORGANIZATIONS, organizationId);
        await updateDoc(orgRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });

        console.log('✅ Organization updated:', organizationId);
        return true;

    } catch (error) {
        console.error('❌ Update organization error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

/**
 * Delete organization
 * @param {string} organizationId - Organization ID
 * @returns {Promise<boolean>}
 */
export async function deleteOrganization(organizationId) {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Check if user is owner
        const org = await getOrganization(organizationId);
        if (!org) {
            throw new Error('Organization not found');
        }

        const userMember = org.members?.find(m => m.userId === currentUser.uid);
        if (!userMember || userMember.role !== ROLES.OWNER) {
            throw new Error('Permission denied. Owner role required.');
        }

        // Delete organization
        const orgRef = doc(db, COLLECTIONS.ORGANIZATIONS, organizationId);
        await deleteDoc(orgRef);

        console.log('✅ Organization deleted:', organizationId);
        return true;

    } catch (error) {
        console.error('❌ Delete organization error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

// ==========================================
// MEMBER MANAGEMENT
// ==========================================

/**
 * Add member to organization
 * @param {string} organizationId - Organization ID
 * @param {string} userEmail - User email to add
 * @param {string} role - User role (default: member)
 * @returns {Promise<boolean>}
 */
export async function addMember(organizationId, userEmail, role = ROLES.MEMBER) {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Check if current user has admin/owner role
        const org = await getOrganization(organizationId);
        if (!org) {
            throw new Error('Organization not found');
        }

        const userMember = org.members?.find(m => m.userId === currentUser.uid);
        if (!userMember || !hasMinimumRole(userMember.role, ROLES.ADMIN)) {
            throw new Error('Permission denied. Admin role required.');
        }

        // Find user by email
        const usersRef = collection(db, COLLECTIONS.USERS);
        const usersSnapshot = await getDocs(usersRef);
        let targetUser = null;

        usersSnapshot.forEach((doc) => {
            const userData = doc.data();
            if (userData.email === userEmail) {
                targetUser = { id: doc.id, ...userData };
            }
        });

        if (!targetUser) {
            throw new Error('User not found with email: ' + userEmail);
        }

        // Check if user is already a member
        const isAlreadyMember = org.members?.some(m => m.userId === targetUser.id);
        if (isAlreadyMember) {
            throw new Error('User is already a member of this organization');
        }

        // Add member to organization
        const orgRef = doc(db, COLLECTIONS.ORGANIZATIONS, organizationId);
        await updateDoc(orgRef, {
            members: arrayUnion({
                userId: targetUser.id,
                email: targetUser.email,
                displayName: targetUser.displayName || '',
                role: role,
                joinedAt: Timestamp.now()
            }),
            updatedAt: serverTimestamp()
        });

        // Add organization to user's organizations list
        const userRef = doc(db, COLLECTIONS.USERS, targetUser.id);
        await updateDoc(userRef, {
            organizations: arrayUnion(organizationId)
        });

        console.log('✅ Member added:', userEmail);
        return true;

    } catch (error) {
        console.error('❌ Add member error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

/**
 * Remove member from organization
 * @param {string} organizationId - Organization ID
 * @param {string} userId - User ID to remove
 * @returns {Promise<boolean>}
 */
export async function removeMember(organizationId, userId) {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Check permissions
        const org = await getOrganization(organizationId);
        if (!org) {
            throw new Error('Organization not found');
        }

        const userMember = org.members?.find(m => m.userId === currentUser.uid);
        if (!userMember || !hasMinimumRole(userMember.role, ROLES.ADMIN)) {
            throw new Error('Permission denied. Admin role required.');
        }

        // Cannot remove owner
        const targetMember = org.members?.find(m => m.userId === userId);
        if (targetMember && targetMember.role === ROLES.OWNER) {
            throw new Error('Cannot remove organization owner');
        }

        // Remove member
        const orgRef = doc(db, COLLECTIONS.ORGANIZATIONS, organizationId);
        await updateDoc(orgRef, {
            members: arrayRemove(targetMember),
            updatedAt: serverTimestamp()
        });

        // Remove organization from user's list
        const userRef = doc(db, COLLECTIONS.USERS, userId);
        await updateDoc(userRef, {
            organizations: arrayRemove(organizationId)
        });

        console.log('✅ Member removed:', userId);
        return true;

    } catch (error) {
        console.error('❌ Remove member error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

/**
 * Update member role
 * @param {string} organizationId - Organization ID
 * @param {string} userId - User ID
 * @param {string} newRole - New role
 * @returns {Promise<boolean>}
 */
export async function updateMemberRole(organizationId, userId, newRole) {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Get organization
        const org = await getOrganization(organizationId);
        if (!org) {
            throw new Error('Organization not found');
        }

        // Check if current user is owner
        const userMember = org.members?.find(m => m.userId === currentUser.uid);
        if (!userMember || userMember.role !== ROLES.OWNER) {
            throw new Error('Permission denied. Owner role required.');
        }

        // Cannot change owner role
        const targetMember = org.members?.find(m => m.userId === userId);
        if (!targetMember) {
            throw new Error('Member not found');
        }
        if (targetMember.role === ROLES.OWNER) {
            throw new Error('Cannot change owner role');
        }

        // Update member role
        const updatedMembers = org.members.map(m => {
            if (m.userId === userId) {
                return { ...m, role: newRole };
            }
            return m;
        });

        const orgRef = doc(db, COLLECTIONS.ORGANIZATIONS, organizationId);
        await updateDoc(orgRef, {
            members: updatedMembers,
            updatedAt: serverTimestamp()
        });

        console.log('✅ Member role updated:', userId, '->', newRole);
        return true;

    } catch (error) {
        console.error('❌ Update member role error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

// ==========================================
// INVITATION SYSTEM
// ==========================================

/**
 * Create invitation
 * @param {string} organizationId - Organization ID
 * @param {string} email - Invitee email
 * @param {string} role - Role for invitee
 * @returns {Promise<object>} Invitation object
 */
export async function createInvitation(organizationId, email, role = ROLES.MEMBER) {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Check permissions
        const org = await getOrganization(organizationId);
        if (!org) {
            throw new Error('Organization not found');
        }

        const userMember = org.members?.find(m => m.userId === currentUser.uid);
        if (!userMember || !hasMinimumRole(userMember.role, ROLES.ADMIN)) {
            throw new Error('Permission denied. Admin role required.');
        }

        // Create invitation
        const inviteRef = doc(collection(db, COLLECTIONS.INVITATIONS));
        const inviteId = inviteRef.id;

        const invitation = {
            id: inviteId,
            organizationId: organizationId,
            organizationName: org.name,
            email: email,
            role: role,
            invitedBy: currentUser.uid,
            invitedByName: currentUser.displayName || currentUser.email,
            status: 'pending',
            createdAt: serverTimestamp(),
            expiresAt: null // Could add expiration logic
        };

        await setDoc(inviteRef, invitation);

        console.log('✅ Invitation created for:', email);
        return invitation;

    } catch (error) {
        console.error('❌ Create invitation error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

/**
 * Accept invitation
 * @param {string} invitationId - Invitation ID
 * @returns {Promise<boolean>}
 */
export async function acceptInvitation(invitationId) {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        // Get invitation
        const inviteRef = doc(db, COLLECTIONS.INVITATIONS, invitationId);
        const inviteDoc = await getDoc(inviteRef);

        if (!inviteDoc.exists()) {
            throw new Error('Invitation not found');
        }

        const invitation = inviteDoc.data();

        // Verify email matches
        if (invitation.email !== currentUser.email) {
            throw new Error('This invitation is not for your email address');
        }

        // Verify invitation is still pending
        if (invitation.status !== 'pending') {
            throw new Error('This invitation has already been used or expired');
        }

        // Add user to organization
        await addMember(invitation.organizationId, currentUser.email, invitation.role);

        // Update invitation status
        await updateDoc(inviteRef, {
            status: 'accepted',
            acceptedAt: serverTimestamp(),
            acceptedBy: currentUser.uid
        });

        console.log('✅ Invitation accepted');
        return true;

    } catch (error) {
        console.error('❌ Accept invitation error:', error);
        throw new Error(getFirebaseErrorMessage(error));
    }
}

/**
 * Get invitations for current user
 * @returns {Promise<Array>} List of pending invitations
 */
export async function getMyInvitations() {
    try {
        const db = getFirebaseDb();
        const currentUser = getCurrentUser();

        if (!currentUser) {
            return [];
        }

        // Query invitations for current user's email that are pending
        const invitesRef = collection(db, COLLECTIONS.INVITATIONS);
        const q = query(invitesRef, where('email', '==', currentUser.email), where('status', '==', 'pending'));
        const snapshot = await getDocs(q);

        const invitations = [];
        snapshot.forEach((doc) => {
            invitations.push({ id: doc.id, ...doc.data() });
        });

        return invitations;

    } catch (error) {
        console.error('❌ Get invitations error:', error);
        return [];
    }
}

// ==========================================
// EXPORTS
// ==========================================

export default {
    createOrganization,
    getOrganization,
    getMyOrganizations,
    updateOrganization,
    deleteOrganization,
    addMember,
    removeMember,
    updateMemberRole,
    createInvitation,
    acceptInvitation,
    getMyInvitations
};

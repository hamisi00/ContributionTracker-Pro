// ContributionTracker Pro - Service Worker
// Provides offline functionality and caching

const CACHE_NAME = 'contribution-tracker-v1.1.0';
const OFFLINE_URL = './index.html';

// Files to cache for offline functionality
// Note: Firebase modules are loaded from CDN and cached separately by Firebase
const CACHE_URLS = [
    './',
    './index.html',
    './auth.html',
    './styles.css',
    './manifest.json',
    './icons/value.png',
    // Core app files (non-module)
    './modules.js',
    './db-manager.js',
    './seed-data.js',
    './api-service.js',
    './app.js',
    // Firebase modules (ES6 modules - may fail, handled gracefully)
    './firebase-config.js',
    './firebase-auth.js',
    './organization-manager.js',
    './firestore-service.js',
    './firestore-adapter.js',
    './app-init.js'
];

// Routes that should always try network first
const NETWORK_FIRST_ROUTES = [
    /\/api\//
];

// Routes that should be cached first (static assets)
const CACHE_FIRST_ROUTES = [
    /\.css$/,
    /\.js$/,
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.svg$/,
    /\.ico$/,
    /\.woff$/,
    /\.woff2$/,
    /\.ttf$/
];

// =============================================
// SERVICE WORKER INSTALLATION
// =============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing ContributionTracker Service Worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching app shell and content');

                // Cache files individually with graceful error handling
                return Promise.allSettled(
                    CACHE_URLS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn('[SW] Failed to cache:', url, err.message);
                            return Promise.resolve(); // Don't fail installation
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] Installation complete (some files may have failed)');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Installation failed:', error);
                // Still skip waiting so SW activates
                return self.skipWaiting();
            })
    );
});

// =============================================
// SERVICE WORKER ACTIVATION
// =============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating ContributionTracker Service Worker...');

    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control of all pages
            self.clients.claim()
        ]).then(() => {
            console.log('[SW] Activation complete');
        })
    );
});

// =============================================
// FETCH EVENT - REQUEST INTERCEPTION
// =============================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip chrome extensions and other protocols
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // Determine caching strategy based on request
    if (shouldUseNetworkFirst(url)) {
        event.respondWith(networkFirst(request));
    } else if (shouldUseCacheFirst(url)) {
        event.respondWith(cacheFirst(request));
    } else {
        event.respondWith(cacheFirst(request));
    }
});

// =============================================
// CACHING STRATEGIES
// =============================================

/**
 * Network First Strategy
 * Try network, fall back to cache
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        // If successful, update cache
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Network first failed, trying cache:', request.url);
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // If requesting a page, return offline page
        if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
        }

        // Return a basic error response
        return new Response('Network error', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

/**
 * Cache First Strategy
 * Try cache, fall back to network
 */
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        // Update cache in background
        updateCacheInBackground(request);
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);

        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Cache and network failed:', request.url);

        // If requesting a page, return offline page
        if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
        }

        return new Response('Resource not available', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

/**
 * Update cache in background (stale-while-revalidate)
 */
async function updateCacheInBackground(request) {
    try {
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
    } catch (error) {
        // Silently fail background updates
    }
}

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Check if URL should use network-first strategy
 */
function shouldUseNetworkFirst(url) {
    return NETWORK_FIRST_ROUTES.some(pattern => pattern.test(url.pathname));
}

/**
 * Check if URL should use cache-first strategy
 */
function shouldUseCacheFirst(url) {
    return CACHE_FIRST_ROUTES.some(pattern => pattern.test(url.pathname));
}

// =============================================
// BACKGROUND SYNC (for future use)
// =============================================
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync event:', event.tag);

    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
});

/**
 * Sync data when online (placeholder for future implementation)
 */
async function syncData() {
    console.log('[SW] Syncing data...');
    // This will be implemented when Google Sheets integration is added
    return Promise.resolve();
}

// =============================================
// PUSH NOTIFICATIONS (for future use)
// =============================================
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    const options = {
        body: event.data ? event.data.text() : 'New update available',
        icon: './icons/icon-192.png',
        badge: './icons/icon-96.png',
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification('ContributionTracker Pro', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    event.notification.close();

    event.waitUntil(
        clients.openWindow('/')
    );
});

// =============================================
// MESSAGE HANDLING
// =============================================
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        return caches.delete(cacheName);
                    })
                );
            }).then(() => {
                return self.registration.unregister();
            })
        );
    }
});

console.log('[SW] Service Worker loaded');

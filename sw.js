/**
 * Service Worker pour PK Locator SNCF
 * Gestion du cache et fonctionnement hors ligne
 */

const CACHE_NAME = 'pk-locator-v2.0.0';
const CACHE_URLS = [
    './',
    './index.html',
    './pk-locator.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    // Les fichiers JSON seront cachés dynamiquement
];

// Installation du service worker
self.addEventListener('install', event => {
    console.log('[SW] Installation...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Mise en cache des ressources de base');
                return cache.addAll(CACHE_URLS);
            })
            .catch(error => {
                console.error('[SW] Erreur lors de la mise en cache:', error);
            })
    );

    // Force l'activation immédiate
    self.skipWaiting();
});

// Activation du service worker
self.addEventListener('activate', event => {
    console.log('[SW] Activation...');

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Suppression ancien cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );

    // Prend le contrôle de toutes les pages
    return self.clients.claim();
});

// Interception des requêtes
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Stratégie cache-first pour les ressources statiques
    if (isStaticResource(url)) {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        console.log('[SW] Ressource trouvée dans le cache:', url.pathname);
                        return response;
                    }

                    console.log('[SW] Ressource non cachée, téléchargement:', url.pathname);
                    return fetch(event.request)
                        .then(response => {
                            // Mise en cache de la réponse
                            if (response.ok) {
                                const responseClone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(event.request, responseClone));
                            }
                            return response;
                        });
                })
                .catch(error => {
                    console.error('[SW] Erreur de récupération:', error);
                    return new Response('Ressource non disponible hors ligne', {
                        status: 404,
                        statusText: 'Not Found'
                    });
                })
        );
    }

    // Stratégie network-first pour les fichiers JSON PK (gros fichiers)
    else if (isPKDataFile(url)) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        console.log('[SW] Données PK téléchargées:', url.pathname);
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, responseClone));
                    }
                    return response;
                })
                .catch(error => {
                    console.log('[SW] Réseau indisponible, vérification cache PK:', url.pathname);
                    return caches.match(event.request)
                        .then(response => {
                            if (response) {
                                console.log('[SW] Données PK trouvées dans le cache');
                                return response;
                            }
                            return new Response('Données PK non disponibles hors ligne', {
                                status: 404,
                                statusText: 'Not Found'
                            });
                        });
                })
        );
    }
});

/**
 * Vérifie si l'URL correspond à une ressource statique
 */
function isStaticResource(url) {
    const staticExtensions = ['.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
    const pathname = url.pathname.toLowerCase();

    return staticExtensions.some(ext => pathname.endsWith(ext)) ||
           pathname === '/' ||
           pathname.includes('manifest.json');
}

/**
 * Vérifie si l'URL correspond à un fichier de données PK
 */
function isPKDataFile(url) {
    const pathname = url.pathname.toLowerCase();
    return pathname.includes('pk_') && pathname.endsWith('.json') ||
           pathname.includes('index_lignes.json') ||
           pathname.includes('corrections.json');
}

// Gestion des messages depuis l'application
self.addEventListener('message', event => {
    if (event.data && event.data.type) {
        switch (event.data.type) {
            case 'SKIP_WAITING':
                self.skipWaiting();
                break;
            case 'CLEAR_CACHE':
                clearCache();
                break;
            case 'GET_CACHE_SIZE':
                getCacheSize().then(size => {
                    event.ports[0].postMessage({ size });
                });
                break;
        }
    }
});

/**
 * Vide le cache
 */
async function clearCache() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
    console.log('[SW] Cache vidé');
}

/**
 * Calcule la taille du cache
 */
async function getCacheSize() {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let totalSize = 0;

    for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
            const blob = await response.blob();
            totalSize += blob.size;
        }
    }

    return totalSize;
}
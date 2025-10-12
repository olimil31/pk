/**
 * PK Locator SNCF - Application mobile pour localisation des points kilométriques
 * Auteur: Assistant IA
 * Version: 2.0.0
 * 
 * Fonctionnalités:
 * - Géolocalisation GPS avec vitesse native
 * - Recherche de PK avec algorithme optimisé
 * - Cache intelligent des données
 * - Interface adaptative jour/nuit
 * - Mode plein écran sans forcer le natif
 * - Gestion des corrections PK
 */

class PKLocator {
    constructor() {
        // Configuration
        this.config = {
            searchRadius: 20, // Rayon de recherche en km
            updateInterval: 1000, // Intervalle de mise à jour en ms (1s)
            fastUpdateInterval: 500, // Intervalle rapide à haute vitesse (0.5s)
            highSpeedThreshold: 50, // Seuil vitesse élevée en km/h
            cacheExpiry: 3600000, // Expiration cache 1h en ms
            maxCacheSize: 50, // Taille max du cache
            accuracyThreshold: 100, // Seuil précision GPS en mètres
            minDistanceForClosest: 5 // Distance minimale pour affichage du plus proche (5m)
        };

        // État de l'application
        this.state = {
            isRunning: false,
            isDarkTheme: false,
            isFullscreen: false,
            keepAwake: false,
            currentPosition: null,
            currentSpeed: 0,
            currentPK: null,
            currentLine: null,
            gpsAccuracy: null,
            distanceToPK: null,
            watchId: null,
            wakeLock: null
        };

        // Cache des données
        this.cache = {
            pkData: new Map(),
            indexData: null,
            corrections: new Map(),
            lastUsed: new Map()
        };

        // Éléments DOM
        this.elements = {};

        // Initialisation
        this.init();
    }

    /**
     * Initialisation de l'application
     */
    async init() {
        try {
            console.log('🚀 Initialisation PK Locator...');

            // Récupération des éléments DOM
            this.initElements();

            // Chargement des événements
            this.initEventListeners();

            // Chargement des données
            await this.loadData();

            // Initialisation du thème
            this.initTheme();

            // Démarrage de la géolocalisation
            await this.startGeolocation();

            // Masquer l'overlay de chargement
            this.hideLoadingOverlay();

            console.log('✅ PK Locator initialisé avec succès');

        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation:', error);
            this.showError('Erreur d\'initialisation: ' + error.message);
        }
    }

    /**
     * Récupération des éléments DOM
     */
    initElements() {
        this.elements = {
            pkValue: document.getElementById('pkValue'),
            speedValue: document.getElementById('speedValue'),
            gpsStatus: document.getElementById('gpsStatus'),
            lineStatus: document.getElementById('lineStatus'),
            accuracyStatus: document.getElementById('accuracyStatus'),
            distanceStatus: document.getElementById('distanceStatus'),
            toggleTheme: document.getElementById('toggleTheme'),
            toggleFullscreen: document.getElementById('toggleFullscreen'),
            keepAwake: document.getElementById('keepAwake'),
            mainContainer: document.getElementById('mainContainer'),
            loadingOverlay: document.getElementById('loadingOverlay')
        };
    }

    /**
     * Initialisation des événements
     */
    initEventListeners() {
        // Bouton thème
        this.elements.toggleTheme.addEventListener('click', () => {
            this.toggleTheme();
        });

        // Bouton plein écran
        this.elements.toggleFullscreen.addEventListener('click', () => {
            this.toggleFullscreenUI();
        });

        // Bouton écran actif
        this.elements.keepAwake.addEventListener('click', () => {
            this.toggleKeepAwake();
        });

        // Gestion des changements de visibilité
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseUpdates();
            } else {
                this.resumeUpdates();
            }
        });

        // Gestion de l'orientation
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.handleOrientationChange(), 500);
        });
    }

    /**
     * Chargement des données SNCF
     */
    async loadData() {
        try {
            console.log('📂 Chargement des données SNCF...');

            // Chargement de l'index des lignes
            const indexResponse = await fetch('./index_lignes.json');
            if (!indexResponse.ok) {
                throw new Error('Impossible de charger l\'index des lignes');
            }
            this.cache.indexData = await indexResponse.json();
            console.log(`✅ Index chargé: ${this.cache.indexData.length} lignes`);

            // Chargement des corrections si disponibles
            try {
                const correctionsResponse = await fetch('./corrections.json');
                if (correctionsResponse.ok) {
                    const corrections = await correctionsResponse.json();
                    corrections.forEach(corr => {
                        const key = `${corr.ligne}_${corr.pk_start}_${corr.pk_end}`;
                        this.cache.corrections.set(key, corr.correction);
                    });
                    console.log(`✅ ${corrections.length} corrections chargées`);
                }
            } catch (e) {
                console.log('ℹ️ Aucun fichier de corrections trouvé');
            }

        } catch (error) {
            console.error('❌ Erreur chargement données:', error);
            throw new Error('Impossible de charger les données SNCF: ' + error.message);
        }
    }

    /**
     * Initialisation du thème
     */
    initTheme() {
        // Récupération du thème sauvegardé ou détection automatique
        const savedTheme = localStorage.getItem('pklocator-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        this.state.isDarkTheme = savedTheme === 'dark' || (savedTheme === null && prefersDark);
        this.applyTheme();
    }

    /**
     * Application du thème
     */
    applyTheme() {
        document.body.className = this.state.isDarkTheme ? 'dark-theme' : 'light-theme';
        this.elements.toggleTheme.textContent = this.state.isDarkTheme ? '☀️ Mode Jour' : '🌙 Mode Nuit';

        // Sauvegarde de la préférence
        localStorage.setItem('pklocator-theme', this.state.isDarkTheme ? 'dark' : 'light');
    }

    /**
     * Basculement du thème
     */
    toggleTheme() {
        this.state.isDarkTheme = !this.state.isDarkTheme;
        this.applyTheme();
    }

    /**
     * Démarrage de la géolocalisation
     */
    async startGeolocation() {
        if (!navigator.geolocation) {
            throw new Error('Géolocalisation non supportée par ce navigateur');
        }

        return new Promise((resolve, reject) => {
            const options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            };

            // Test initial de position
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log('✅ Géolocalisation activée');
                    this.updateGPSStatus('Actif', 'status-good');

                    // Démarrage du suivi
                    this.startPositionWatching();
                    resolve();
                },
                (error) => {
                    console.error('❌ Erreur géolocalisation:', error);
                    this.handleGeolocationError(error);
                    reject(error);
                },
                options
            );
        });
    }

    /**
     * Démarrage du suivi de position
     */
    startPositionWatching() {
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 1000
        };

        this.state.watchId = navigator.geolocation.watchPosition(
            (position) => this.handlePositionUpdate(position),
            (error) => this.handleGeolocationError(error),
            options
        );

        this.state.isRunning = true;
    }

    /**
     * Gestion des mises à jour de position
     */
    async handlePositionUpdate(position) {
        try {
            const coords = position.coords;

            // Mise à jour de l'état
            this.state.currentPosition = {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
                timestamp: position.timestamp
            };

            this.state.gpsAccuracy = coords.accuracy;

            // Mise à jour de la vitesse
            if (coords.speed !== null && coords.speed >= 0) {
                // Utilisation de la vitesse native GPS (m/s vers km/h)
                this.state.currentSpeed = coords.speed * 3.6;
            } else {
                // Calcul de vitesse basé sur la position
                this.calculateSpeedFromPosition(coords);
            }

            // Recherche du PK le plus proche
            await this.findNearestPK(coords.latitude, coords.longitude);

            // Mise à jour de l'interface
            this.updateUI();

            // Adaptation de la fréquence de mise à jour
            this.adaptUpdateFrequency();

        } catch (error) {
            console.error('❌ Erreur traitement position:', error);
        }
    }

    /**
     * Calcul de vitesse basé sur les positions précédentes
     */
    calculateSpeedFromPosition(coords) {
        if (!this.lastPosition || !this.lastTimestamp) {
            this.lastPosition = coords;
            this.lastTimestamp = Date.now();
            return;
        }

        const now = Date.now();
        const timeDiff = (now - this.lastTimestamp) / 1000; // en secondes

        if (timeDiff < 1) return; // Éviter les calculs trop fréquents

        const distance = this.calculateHaversineDistance(
            this.lastPosition.latitude,
            this.lastPosition.longitude,
            coords.latitude,
            coords.longitude
        );

        // Distance en mètres, temps en secondes → vitesse en m/s → km/h
        const speedMps = distance / timeDiff;
        this.state.currentSpeed = speedMps * 3.6;

        // Mise à jour des dernières valeurs
        this.lastPosition = coords;
        this.lastTimestamp = now;
    }

    /**
     * Recherche du PK le plus proche
     */
    async findNearestPK(latitude, longitude) {
        try {
            // 1. Filtrer les lignes dans le rayon de recherche
            const nearbyLines = this.filterNearbyLines(latitude, longitude);

            if (nearbyLines.length === 0) {
                this.state.currentPK = null;
                this.state.currentLine = null;
                return;
            }

            // 2. Rechercher dans chaque ligne
            let closestPK = null;
            let minDistance = Infinity;

            for (const line of nearbyLines) {
                const pkData = await this.loadPKDataForLine(line.code_ligne);
                if (!pkData) continue;

                // Recherche des 2 PK les plus proches
                const distances = pkData.map(pk => ({
                    pk: pk,
                    distance: this.calculateHaversineDistance(latitude, longitude, pk.lat, pk.lon)
                })).sort((a, b) => a.distance - b.distance);

                if (distances.length >= 2) {
                    const [first, second] = distances;

                    // Logique spéciale: si on est à moins de 5m, on prend le vrai plus proche
                    // sinon on prend le plus petit des deux premiers PK
                    let selectedPK;
                    if (first.distance < (this.config.minDistanceForClosest / 1000)) {
                        selectedPK = first;
                    } else {
                        selectedPK = first.pk.pk < second.pk.pk ? first : second;
                    }

                    if (selectedPK.distance < minDistance) {
                        minDistance = selectedPK.distance;
                        closestPK = {
                            ...selectedPK.pk,
                            ligne: line.code_ligne,
                            distance: selectedPK.distance
                        };
                    }
                }
            }

            // 3. Application des corrections si nécessaires
            if (closestPK) {
                closestPK = this.applyCorrections(closestPK);
            }

            // 4. Mise à jour de l'état
            this.state.currentPK = closestPK;
            this.state.currentLine = closestPK ? closestPK.ligne : null;
            this.state.distanceToPK = closestPK ? closestPK.distance * 1000 : null; // en mètres

        } catch (error) {
            console.error('❌ Erreur recherche PK:', error);
        }
    }

    /**
     * Filtrage des lignes à proximité
     */
  /**  filterNearbyLines(latitude, longitude) {
        return this.cache.indexData.filter(line => {
            const centerLat = (line.minLat + line.maxLat) / 2;
            const centerLon = (line.minLon + line.maxLon) / 2;

            const distance = this.calculateHaversineDistance(
                latitude, longitude, centerLat, centerLon
            );

            return distance <= this.config.searchRadius;
        });
    } */
    // Fonction pour filtrer les lignes selon inclusion ou proximité dans la bounding box
filterNearbyLines(latitude, longitude) {
    const marginDeg = 0.18; // marge en degrés ≈ 20km (ajustable)

    return this.cache.indexData.filter(line => {
        // Vérifier si la position est dans la bounding box élargie
        const inLatRange = latitude >= (line.minLat - marginDeg) && latitude <= (line.maxLat + marginDeg);
        const inLonRange = longitude >= (line.minLon - marginDeg) && longitude <= (line.maxLon + marginDeg);

        return inLatRange && inLonRange;
    });
}
    /**
     * Chargement des données PK pour une ligne
     */
    async loadPKDataForLine(codeLigne) {
        // Vérification du cache
        if (this.cache.pkData.has(codeLigne)) {
            this.cache.lastUsed.set(codeLigne, Date.now());
            return this.cache.pkData.get(codeLigne);
        }

        try {
            const response = await fetch(`./pk_${codeLigne}.json`);
            if (!response.ok) {
                console.warn(`⚠️ Fichier PK non trouvé pour ligne ${codeLigne}`);
                return null;
            }

            const pkData = await response.json();

            // Mise en cache avec gestion de la taille
            this.manageCacheSize();
            this.cache.pkData.set(codeLigne, pkData);
            this.cache.lastUsed.set(codeLigne, Date.now());

            console.log(`✅ Données PK chargées pour ligne ${codeLigne}: ${pkData.length} points`);
            return pkData;

        } catch (error) {
            console.error(`❌ Erreur chargement PK ligne ${codeLigne}:`, error);
            return null;
        }
    }

    /**
     * Gestion de la taille du cache
     */
    manageCacheSize() {
        if (this.cache.pkData.size >= this.config.maxCacheSize) {
            // Suppression de l'entrée la moins récemment utilisée
            let oldestKey = null;
            let oldestTime = Date.now();

            this.cache.lastUsed.forEach((time, key) => {
                if (time < oldestTime) {
                    oldestTime = time;
                    oldestKey = key;
                }
            });

            if (oldestKey) {
                this.cache.pkData.delete(oldestKey);
                this.cache.lastUsed.delete(oldestKey);
                console.log(`🗑️ Cache nettoyé: ligne ${oldestKey} supprimée`);
            }
        }
    }

    /**
     * Application des corrections PK
     */
    applyCorrections(pkData) {
        for (const [key, correction] of this.cache.corrections) {
            const [ligne, pkStart, pkEnd] = key.split('_');

            if (ligne === pkData.ligne && 
                pkData.pk >= parseFloat(pkStart) && 
                pkData.pk <= parseFloat(pkEnd)) {

                pkData.pk += parseFloat(correction);
                pkData.corrected = true;
                break;
            }
        }
        return pkData;
    }

    /**
     * Calcul de distance haversine
     */
    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Rayon de la Terre en km
        const dLat = this.degreesToRadians(lat2 - lat1);
        const dLon = this.degreesToRadians(lon2 - lon1);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.degreesToRadians(lat1)) * Math.cos(this.degreesToRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance en kilomètres
    }

    /**
     * Conversion degrés vers radians
     */
    degreesToRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Mise à jour de l'interface utilisateur
     */
    updateUI() {
        // Mise à jour du PK
        if (this.state.currentPK) {
            this.elements.pkValue.textContent = this.state.currentPK.pk.toFixed(1);
            this.elements.pkValue.className = 'display-value';
        } else {
            this.elements.pkValue.textContent = '--';
            this.elements.pkValue.className = 'display-value pulse';
        }

        // Mise à jour de la vitesse
        this.elements.speedValue.textContent = Math.round(this.state.currentSpeed);

        // Mise à jour du statut GPS
        this.updateGPSAccuracyStatus();

        // Mise à jour de la ligne détectée
        this.elements.lineStatus.textContent = this.state.currentLine || 'Aucune';

        // Mise à jour de la distance au PK
        if (this.state.distanceToPK !== null) {
            this.elements.distanceStatus.textContent = `${Math.round(this.state.distanceToPK)} m`;
        } else {
            this.elements.distanceStatus.textContent = '-- m';
        }
    }

    /**
     * Mise à jour du statut de précision GPS
     */
    updateGPSAccuracyStatus() {
        if (this.state.gpsAccuracy === null) {
            this.elements.accuracyStatus.innerHTML = 
                '<span class="accuracy-indicator accuracy-low"></span>--';
            return;
        }

        let accuracyClass, accuracyText;
        if (this.state.gpsAccuracy <= 10) {
            accuracyClass = 'accuracy-high';
            accuracyText = `${Math.round(this.state.gpsAccuracy)}m (Excellent)`;
        } else if (this.state.gpsAccuracy <= 50) {
            accuracyClass = 'accuracy-medium';
            accuracyText = `${Math.round(this.state.gpsAccuracy)}m (Bon)`;
        } else {
            accuracyClass = 'accuracy-low';
            accuracyText = `${Math.round(this.state.gpsAccuracy)}m (Faible)`;
        }

        this.elements.accuracyStatus.innerHTML = 
            `<span class="accuracy-indicator ${accuracyClass}"></span>${accuracyText}`;
    }

    /**
     * Mise à jour du statut GPS
     */
    updateGPSStatus(status, statusClass = '') {
        this.elements.gpsStatus.textContent = status;
        this.elements.gpsStatus.className = `status-value ${statusClass}`;
    }

    /**
     * Adaptation de la fréquence de mise à jour
     */
    adaptUpdateFrequency() {
        // Si vitesse élevée, augmenter la fréquence de mise à jour
        if (this.state.currentSpeed > this.config.highSpeedThreshold) {
            if (this.currentInterval !== this.config.fastUpdateInterval) {
                this.setUpdateInterval(this.config.fastUpdateInterval);
            }
        } else {
            if (this.currentInterval !== this.config.updateInterval) {
                this.setUpdateInterval(this.config.updateInterval);
            }
        }
    }

    /**
     * Définition de l'intervalle de mise à jour
     */
    setUpdateInterval(interval) {
        this.currentInterval = interval;
        // Note: La fréquence est déjà gérée par watchPosition
        // Cette méthode peut être étendue pour d'autres optimisations
    }

    /**
     * Basculement du mode plein écran UI
     */
    toggleFullscreenUI() {
        this.state.isFullscreen = !this.state.isFullscreen;

        if (this.state.isFullscreen) {
            document.body.classList.add('fullscreen-ui');
            this.elements.toggleFullscreen.textContent = '🔲 Normal';
        } else {
            document.body.classList.remove('fullscreen-ui');
            this.elements.toggleFullscreen.textContent = '📺 Plein écran';
        }
    }

    /**
     * Basculement du maintien d'écran actif
     */
    async toggleKeepAwake() {
        if ('wakeLock' in navigator) {
            try {
                if (this.state.wakeLock) {
                    await this.state.wakeLock.release();
                    this.state.wakeLock = null;
                    this.state.keepAwake = false;
                    this.elements.keepAwake.textContent = '💡 Écran actif';
                } else {
                    this.state.wakeLock = await navigator.wakeLock.request('screen');
                    this.state.keepAwake = true;
                    this.elements.keepAwake.textContent = '💤 Économie';
                }
            } catch (error) {
                console.log('⚠️ Wake Lock non supporté:', error);
                this.showError('Maintien d\'écran non supporté sur cet appareil');
            }
        } else {
            this.showError('Maintien d\'écran non supporté sur ce navigateur');
        }
    }

    /**
     * Gestion des erreurs de géolocalisation
     */
    handleGeolocationError(error) {
        let message;
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = 'Accès refusé';
                this.showError('Veuillez autoriser la géolocalisation pour utiliser l\'application');
                break;
            case error.POSITION_UNAVAILABLE:
                message = 'Non disponible';
                this.showError('Position GPS non disponible. Vérifiez votre connexion et les paramètres de localisation.');
                break;
            case error.TIMEOUT:
                message = 'Timeout';
                break;
            default:
                message = 'Erreur GPS';
                break;
        }

        this.updateGPSStatus(message, 'status-warning');
    }

    /**
     * Pause des mises à jour
     */
    pauseUpdates() {
        if (this.state.watchId) {
            navigator.geolocation.clearWatch(this.state.watchId);
            this.state.watchId = null;
            this.state.isRunning = false;
        }
    }

    /**
     * Reprise des mises à jour
     */
    resumeUpdates() {
        if (!this.state.isRunning) {
            this.startPositionWatching();
        }
    }

    /**
     * Gestion du changement d'orientation
     */
    handleOrientationChange() {
        // Forcer un redraw après changement d'orientation
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);
    }

    /**
     * Masquer l'overlay de chargement
     */
    hideLoadingOverlay() {
        this.elements.loadingOverlay.style.display = 'none';
    }

    /**
     * Affichage d'erreur
     */
    showError(message) {
        // Simple affichage d'erreur - peut être amélioré
        alert(message);
    }

    /**
     * Nettoyage lors de la fermeture
     */
    cleanup() {
        if (this.state.watchId) {
            navigator.geolocation.clearWatch(this.state.watchId);
        }

        if (this.state.wakeLock) {
            this.state.wakeLock.release();
        }
    }
}

// Initialisation de l'application quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    window.pkLocator = new PKLocator();
});

// Nettoyage lors de la fermeture
window.addEventListener('beforeunload', () => {
    if (window.pkLocator) {
        window.pkLocator.cleanup();
    }
});

// Service Worker pour PWA (optionnel)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('✅ SW enregistré:', registration.scope);
            })
            .catch(error => {
                console.log('⚠️ SW non enregistré:', error);
            });
    });
}

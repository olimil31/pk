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
            searchRadius: 20, // rayon de recherche en km pour élargir la bounding box
            updateInterval: 1000,
            fastUpdateInterval: 500,
            highSpeedThreshold: 50,
            cacheExpiry: 3600000,
            maxCacheSize: 50,
            accuracyThreshold: 100,
            minDistanceForClosest: 5
        };

        // Etat de l'application
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

        // Cache
        this.cache = {
            pkData: new Map(),
            indexData: null,
            corrections: new Map(),
            lastUsed: new Map()
        };

        // Logs
        this.logBuffer = [];
        this.lastPKLog = null;

        // DOM Elements
        this.elements = {};

        // Initialisation
        this.init();
    }

  async init() {
    try {
        this.initElements();
        this.initEventListeners();
        await this.loadData();
        this.initTheme();
        await this.startGeolocation();
    } catch (error) {
        console.error('❌ Initialisation erreur:', error);
        this.showError('Erreur initialisation: ' + error.message);
    } finally {
        this.hideLoadingOverlay(); // ✅ Toujours exécuté
    }
}

    }

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
            loadingOverlay: document.getElementById('loadingOverlay'),
            warningBadge: document.querySelector('.warning-badge')
        };
    }

    initEventListeners() {
        this.elements.toggleTheme.addEventListener('click', () => this.toggleTheme());
        this.elements.toggleFullscreen.addEventListener('click', () => this.toggleFullscreenUI());
        this.elements.keepAwake.addEventListener('click', () => this.toggleKeepAwake());

        // Triple clic sur warningBadge pour afficher logs
        let disclaimerClicks = 0, clickTimer = null;
        this.elements.warningBadge.addEventListener('click', () => {
            disclaimerClicks++;
            if (clickTimer) clearTimeout(clickTimer);
            if (disclaimerClicks === 3) {
                disclaimerClicks = 0;
                this.showLogPanel();
            } else {
                clickTimer = setTimeout(() => { disclaimerClicks = 0; }, 1200);
            }
        });

        // Clic sur PK ou vitesse pour affichage agrandi
        this.elements.pkValue.parentElement.addEventListener('click', () => this.focusDisplay('pk'));
        this.elements.speedValue.parentElement.addEventListener('click', () => this.focusDisplay('speed'));

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.pauseUpdates();
            else this.resumeUpdates();
        });

        window.addEventListener('orientationchange', () => {
            setTimeout(() => window.dispatchEvent(new Event('resize')), 500);
        });
    }

    async loadData() {
        try {
            const indexResponse = await fetch('./index_lignes.json');
            if (!indexResponse.ok) throw new Error("Impossible de charger index_lignes.json");
            this.cache.indexData = await indexResponse.json();

            try {
                const correctionsResp = await fetch('./corrections.json');
                if (correctionsResp.ok) {
                    const correctionsArr = await correctionsResp.json();
                    correctionsArr.forEach(corr => {
                        const key = `${corr.ligne}_${corr.pk_start}_${corr.pk_end}`;
                        this.cache.corrections.set(key, corr.correction);
                    });
                }
            } catch {
                console.log('Corrections non trouvées, ok.');
            }
        } catch (error) {
            throw new Error("Erreur chargement données: " + error.message);
        }
    }

    initTheme() {
        const savedTheme = localStorage.getItem('pklocator-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.state.isDarkTheme = savedTheme === 'dark' || (savedTheme === null && prefersDark);
        this.applyTheme();
    }

    applyTheme() {
        document.body.className = this.state.isDarkTheme ? 'dark-theme' : 'light-theme';
        this.elements.toggleTheme.textContent = this.state.isDarkTheme ? '☀️ Mode Jour' : '🌙 Mode Nuit';
        localStorage.setItem('pklocator-theme', this.state.isDarkTheme ? 'dark' : 'light');
    }

    toggleTheme() {
        this.state.isDarkTheme = !this.state.isDarkTheme;
        this.applyTheme();
    }

    async startGeolocation() {
        if (!navigator.geolocation) throw new Error('Géolocalisation non supportée');
        return new Promise((resolve, reject) => {
            const options = {
                enableHighAccuracy: true,
                timeout: 30000,
                maximumAge: 0
            };
            navigator.geolocation.getCurrentPosition(pos => {
                this.updateGPSStatus('Actif', 'status-good');
                this.startPositionWatching();
                resolve();
            }, error => {
                this.handleGeolocationError(error);
                reject(error);
            }, options);
        });
    }

    startPositionWatching() {
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 1000
        };
        this.state.watchId = navigator.geolocation.watchPosition(pos => this.handlePositionUpdate(pos), err => this.handleGeolocationError(err), options);
        this.state.isRunning = true;
    }

    async handlePositionUpdate(position) {
        const coords = position.coords;
        this.state.currentPosition = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            timestamp: position.timestamp
        };
        this.state.gpsAccuracy = coords.accuracy;

        if (coords.speed !== null && coords.speed >= 0) {
            this.state.currentSpeed = coords.speed * 3.6;
        } else {
            this.calculateSpeedFromPosition(coords);
        }

        await this.findNearestPK(coords.latitude, coords.longitude);
        this.updateUI();
        this.adaptUpdateFrequency();
    }

    calculateSpeedFromPosition(coords) {
        if (!this.lastPosition || !this.lastTimestamp) {
            this.lastPosition = coords;
            this.lastTimestamp = Date.now();
            return;
        }
        const now = Date.now();
        const timeDiff = (now - this.lastTimestamp) / 1000;
        if (timeDiff < 1) return;
        const distance = this.calculateHaversineDistance(this.lastPosition.latitude, this.lastPosition.longitude, coords.latitude, coords.longitude);
        const speedMps = distance / timeDiff;
        this.state.currentSpeed = speedMps * 3.6;
        this.lastPosition = coords;
        this.lastTimestamp = now;
    }

    filterNearbyLines(latitude, longitude) {
        const marginDeg = 0.18; // ~20 km margin in degrees
        return this.cache.indexData.filter(line => {
            const inLatRange = latitude >= (line.minLat - marginDeg) && latitude <= (line.maxLat + marginDeg);
            const inLonRange = longitude >= (line.minLon - marginDeg) && longitude <= (line.maxLon + marginDeg);
            return inLatRange && inLonRange;
        });
    }

    async loadPKDataForLine(codeLigne) {
        if (this.cache.pkData.has(codeLigne)) {
            this.cache.lastUsed.set(codeLigne, Date.now());
            return this.cache.pkData.get(codeLigne);
        }
        try {
            const response = await fetch(`./pk_${codeLigne}.json`);
            if (!response.ok) return null;
            const pkData = await response.json();
            this.manageCacheSize();
            this.cache.pkData.set(codeLigne, pkData);
            this.cache.lastUsed.set(codeLigne, Date.now());
            return pkData;
        } catch {
            return null;
        }
    }

    manageCacheSize() {
        if (this.cache.pkData.size >= this.config.maxCacheSize) {
            let oldestKey = null;
            let oldestTime = Date.now();
            this.cache.lastUsed.forEach((t, k) => {
                if (t < oldestTime) {
                    oldestTime = t;
                    oldestKey = k;
                }
            });
            if (oldestKey) {
                this.cache.pkData.delete(oldestKey);
                this.cache.lastUsed.delete(oldestKey);
            }
        }
    }

    applyCorrections(pkData) {
        for (const [key, correction] of this.cache.corrections) {
            const [ligne, pkStart, pkEnd] = key.split('_');
            if (ligne === pkData.ligne && pkData.pk >= parseFloat(pkStart) && pkData.pk <= parseFloat(pkEnd)) {
                pkData.pk += parseFloat(correction);
                pkData.corrected = true;
                break;
            }
        }
        return pkData;
    }

    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.degreesToRadians(lat2 - lat1);
        const dLon = this.degreesToRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.degreesToRadians(lat1)) * Math.cos(this.degreesToRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    degreesToRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    async findNearestPK(latitude, longitude) {
        const nearbyLines = this.filterNearbyLines(latitude, longitude);
        if (nearbyLines.length === 0) {
            this.state.currentPK = null;
            this.state.currentLine = null;
            return;
        }

        for (const line of nearbyLines) {
            const pkData = await this.loadPKDataForLine(line.code_ligne);
            if (!pkData) continue;

            const sortedPKs = pkData.map(pk => ({
                pkObj: pk,
                distance: this.calculateHaversineDistance(latitude, longitude, pk.lat, pk.lon)
            })).sort((a, b) => a.distance - b.distance);

            const beforeCorrection = sortedPKs.slice(0, 2);

            let selectedPK;
            if (beforeCorrection[0].distance < (this.config.minDistanceForClosest / 1000)) {
                selectedPK = beforeCorrection[0];
            } else {
                selectedPK = beforeCorrection[0].pkObj.pk < beforeCorrection[1].pkObj.pk ? beforeCorrection[0] : beforeCorrection[1];
            }

            const pkSelectedOriginal = { ...selectedPK };
            const pkSelectedCorr = this.applyCorrections({ ...selectedPK.pkObj });
            
            // Mise à jour logs détaillés
            this.lastPKLog = {
                time: new Date().toLocaleTimeString(),
                line: line.code_ligne,
                beforeCorrection: beforeCorrection.map(o => ({
                    pk: o.pkObj.pk,
                    dist: o.distance,
                })),
                selected: pkSelectedOriginal.pkObj.pk,
                correctionApplied: pkSelectedCorr.pk,
                correctionValue: pkSelectedCorr.pk - pkSelectedOriginal.pkObj.pk
            };

            this.state.currentPK = pkSelectedCorr;
            this.state.currentLine = line.code_ligne;
            this.state.distanceToPK = Math.round(selectedPK.distance * 1000);
            break; // garder la première ligne proche seulement, adapter si multi-lignes
        }
    }

    updateUI() {
        if (this.state.currentPK) {
            this.elements.pkValue.textContent = this.state.currentPK.pk.toFixed(1);
            this.elements.pkValue.className = 'display-value';
        } else {
            this.elements.pkValue.textContent = '--';
            this.elements.pkValue.className = 'display-value pulse';
        }

        this.elements.speedValue.textContent = Math.round(this.state.currentSpeed);
        this.updateGPSAccuracyStatus();
        this.elements.lineStatus.textContent = this.state.currentLine || 'Aucune';
        this.elements.distanceStatus.textContent = this.state.distanceToPK !== null ? `${this.state.distanceToPK} m` : '-- m';
    }

    updateGPSAccuracyStatus() {
        if (this.state.gpsAccuracy === null) {
            this.elements.accuracyStatus.innerHTML = '<span class="accuracy-indicator accuracy-low"></span>--';
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
        this.elements.accuracyStatus.innerHTML = `<span class="accuracy-indicator ${accuracyClass}"></span>${accuracyText}`;
    }

    updateGPSStatus(status, statusClass = '') {
        this.elements.gpsStatus.textContent = status;
        this.elements.gpsStatus.className = `status-value ${statusClass}`;
    }

    adaptUpdateFrequency() {
        if (this.state.currentSpeed > this.config.highSpeedThreshold) {
            if (this.currentInterval !== this.config.fastUpdateInterval) {
                this.setUpdateInterval(this.config.fastUpdateInterval);
            }
        } else if (this.currentInterval !== this.config.updateInterval) {
            this.setUpdateInterval(this.config.updateInterval);
        }
    }

    setUpdateInterval(interval) {
        this.currentInterval = interval;
        // peut être étendu à l'avenir
    }

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
            } catch {
                this.showError("Maintien d'écran non supporté");
            }
        } else {
            this.showError("Maintien d'écran non supporté");
        }
    }

    handleGeolocationError(error) {
        let message;
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = 'Accès refusé';
                this.showError('Veuillez autoriser la géolocalisation');
                break;
            case error.POSITION_UNAVAILABLE:
                message = 'Non disponible';
                this.showError('Position GPS non disponible');
                break;
            case error.TIMEOUT:
                message = 'Timeout';
                break;
            default:
                message = 'Erreur GPS';
        }
        this.updateGPSStatus(message, 'status-warning');
    }

    pauseUpdates() {
        if (this.state.watchId) {
            navigator.geolocation.clearWatch(this.state.watchId);
            this.state.watchId = null;
            this.state.isRunning = false;
        }
    }

    resumeUpdates() {
        if (!this.state.isRunning) {
            this.startPositionWatching();
        }
    }

    handleOrientationChange() {
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    }

    hideLoadingOverlay() {
        this.elements.loadingOverlay.style.display = 'none';
    }

    showError(message) {
        alert(message);
    }

    cleanup() {
        if (this.state.watchId) navigator.geolocation.clearWatch(this.state.watchId);
        if (this.state.wakeLock) this.state.wakeLock.release();
    }

    // Gestion affichage agrandi (clic PK ou vitesse)
    focusDisplay(type) {
        const mainDisplay = document.querySelector('.main-display');
        if (mainDisplay.classList.contains('focus-pk') || mainDisplay.classList.contains('focus-speed')) {
            mainDisplay.classList.remove('focus-pk', 'focus-speed');
            return;
        }
        if (type === 'pk') mainDisplay.classList.add('focus-pk');
        else if (type === 'speed') mainDisplay.classList.add('focus-speed');
    }

    // Affichage panneau logs
    showLogPanel() {
        const panel = document.getElementById('logPanel');
        const logArea = document.getElementById('logContent');
        let text = '';
        if (this.lastPKLog) {
            text = `[${this.lastPKLog.time}] Ligne : ${this.lastPKLog.line}
Avant correction :
   PK1 : ${this.lastPKLog.beforeCorrection[0].pk} (à ${(this.lastPKLog.beforeCorrection[0].dist*1000).toFixed(0)}m)
   PK2 : ${this.lastPKLog.beforeCorrection[1].pk} (à ${(this.lastPKLog.beforeCorrection[1].dist*1000).toFixed(0)}m)
Sélectionné : PK ${this.lastPKLog.selected}
Après correction : PK ${this.lastPKLog.correctionApplied}
Correction appliquée : ${this.lastPKLog.correctionValue>0?'+':''}${this.lastPKLog.correctionValue}
`;
        } else {
            text = 'Aucune donnée PK loggable.
';
        }
        logArea.textContent = text;
        panel.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.pkLocator = new PKLocator();
});

window.addEventListener('beforeunload', () => {
    if (window.pkLocator) {
        window.pkLocator.cleanup();
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(registration => {
            console.log('✅ SW enregistré:', registration.scope);
        }).catch(error => {
            console.warn('⚠️ SW non enregistré:', error);
        });
    });
}

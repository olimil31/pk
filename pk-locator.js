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
        this.config = {
            searchRadius: 20, // km
            updateInterval: 1000, // ms
            fastUpdateInterval: 500, // ms haute vitesse
            highSpeedThreshold: 50, // km/h
            cacheExpiry: 3600000, // ms (1h)
            maxCacheSize: 50,
            accuracyThreshold: 100, // m GPS accuracy acceptable
            minDistanceForClosest: 5, // m, seuil closest PK display
            gpsTimeoutDuration: 15000, // ms, timeout GPS chaud amélioré
            gpsRetryDelay: 3000, // ms, délai relance si timeout
        };

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
            wakeLock: null,
        };

        this.cache = {
            pkData: new Map(),
            indexData: null,
            corrections: new Map(),
            lastUsed: new Map(),
        };

        this.logBuffer = [];
        this.lastClosestPKs = [];
        this.lastSelectedPK = null;

        this.elements = {};

        this.init();
    }

    async init() {
        try {
            this.initElements();
            this.initEventListeners();
            await this.loadData();
            this.initTheme();
            await this.startGeolocation();
            this.hideLoadingOverlay();
        } catch (error) {
            console.error("Erreur lors de l'initialisation:", error);
            this.showError("Erreur d'initialisation: " + error.message);
        }
    }

    initElements() {
        this.elements = {
            pkValue: document.getElementById("pkValue"),
            speedValue: document.getElementById("speedValue"),
            gpsStatus: document.getElementById("gpsStatus"),
            lineStatus: document.getElementById("lineStatus"),
            accuracyStatus: document.getElementById("accuracyStatus"),
            distanceStatus: document.getElementById("distanceStatus"),
            toggleTheme: document.getElementById("toggleTheme"),
            toggleFullscreen: document.getElementById("toggleFullscreen"),
            keepAwake: document.getElementById("keepAwake"),
            mainContainer: document.getElementById("mainContainer"),
            loadingOverlay: document.getElementById("loadingOverlay"),
            warningBadge: document.querySelector(".warning-badge"),
            pkCard: document.getElementById("pkCard"),
            speedCard: document.getElementById("speedCard"),
            logPanel: document.getElementById("logPanel"),
            logContent: document.getElementById("logContent"),
        };

        // Clic sur la case PK
        this.elements.pkCard.addEventListener("click", () => {
            this.focusDisplay("pk");
        });

        // Clic sur la case Vitesse
        this.elements.speedCard.addEventListener("click", () => {
            this.focusDisplay("speed");
        });

        // Simple clic sur disclaimer affiche logs
        this.elements.warningBadge.addEventListener("click", () => {
            this.showLogPanel();
        });
    }

    initEventListeners() {
        this.elements.toggleTheme.addEventListener("click", () => this.toggleTheme());
        this.elements.toggleFullscreen.addEventListener("click", () => this.toggleFullscreenUI());
        this.elements.keepAwake.addEventListener("click", () => this.toggleKeepAwake());
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) this.pauseUpdates();
            else this.resumeUpdates();
        });
        window.addEventListener("orientationchange", () => {
            setTimeout(() => this.handleOrientationChange(), 500);
        });
    }

    async loadData() {
        try {
            const indexResponse = await fetch("./index_lignes.json");
            if (!indexResponse.ok) throw new Error("Impossible de charger l'index des lignes");
            this.cache.indexData = await indexResponse.json();

            try {
                const corrResponse = await fetch("./corrections.json");
                if (corrResponse.ok) {
                    const corrections = await corrResponse.json();
                    corrections.forEach((corr) => {
                        const key = `${corr.ligne}_${corr.pk_start}_${corr.pk_end}`;
                        this.cache.corrections.set(key, corr.correction);
                    });
                }
            } catch (e) {
                // Corrections inexistantes tolérées
            }
        } catch (error) {
            console.error("Erreur chargement données:", error);
            throw new Error("Impossible de charger les données SNCF: " + error.message);
        }
    }

    initTheme() {
        const savedTheme = localStorage.getItem("pklocator-theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        this.state.isDarkTheme = savedTheme === "dark" || (savedTheme === null && prefersDark);
        this.applyTheme();
    }

    applyTheme() {
        document.body.className = this.state.isDarkTheme ? "dark-theme" : "light-theme";
        this.elements.toggleTheme.textContent = this.state.isDarkTheme ? "☀️ Mode Jour" : "🌙 Mode Nuit";
        localStorage.setItem("pklocator-theme", this.state.isDarkTheme ? "dark" : "light");
    }

    toggleTheme() {
        this.state.isDarkTheme = !this.state.isDarkTheme;
        this.applyTheme();
    }

    async startGeolocation() {
        if (!navigator.geolocation) throw new Error("Géolocalisation non supportée par ce navigateur");

        const options = {
            enableHighAccuracy: true,
            timeout: this.config.gpsTimeoutDuration,
            maximumAge: 0,
        };

        const getPositionPromise = () =>
            new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, options);
            });

        // Attente position avec gestion timeout et retries
        const attemptPosition = async (retries = 3) => {
            try {
                const position = await Promise.race([
                    getPositionPromise(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Timeout géolocalisation")), this.config.gpsTimeoutDuration + 2000)
                    ),
                ]);
                this.updateGPSStatus("Actif", "status-good");
                this.startPositionWatching();
                return position;
            } catch (err) {
                if (retries > 0) {
                    await new Promise((res) => setTimeout(res, this.config.gpsRetryDelay));
                    return attemptPosition(retries - 1);
                } else {
                    this.handleGeolocationError({ code: 3 }); // timeout
                    throw err;
                }
            }
        };

        try {
            await attemptPosition();
        } catch (e) {
            throw e;
        }
    }

    startPositionWatching() {
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 1000,
        };

        this.state.watchId = navigator.geolocation.watchPosition(
            (position) => this.handlePositionUpdate(position),
            (error) => this.handleGeolocationError(error),
            options
        );

        this.state.isRunning = true;
    }

    async handlePositionUpdate(position) {
        try {
            const coords = position.coords;

            this.state.currentPosition = {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
                timestamp: position.timestamp,
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
        } catch (error) {
            console.error("Erreur traitement position:", error);
        }
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

        const distance = this.calculateHaversineDistance(
            this.lastPosition.latitude,
            this.lastPosition.longitude,
            coords.latitude,
            coords.longitude
        );

        const speedMps = distance / timeDiff;

        this.state.currentSpeed = speedMps * 3.6;

        this.lastPosition = coords;
        this.lastTimestamp = now;
    }

    async findNearestPK(latitude, longitude) {
        try {
            const nearbyLines = this.filterNearbyLines(latitude, longitude);

            if (nearbyLines.length === 0) {
                this.state.currentPK = null;
                this.state.currentLine = null;
                return;
            }

            let closestPK = null;
            let minDistance = Infinity;

            // Préparer logs & buffer PK
            this.lastClosestPKs = [];
            if (!this.logBuffer) this.logBuffer = [];

            for (const line of nearbyLines) {
                const pkData = await this.loadPKDataForLine(line.code_ligne);
                if (!pkData) continue;

                const distances = pkData
                    .map((pk) => ({
                        pk: pk,
                        distance: this.calculateHaversineDistance(latitude, longitude, pk.lat, pk.lon),
                    }))
                    .sort((a, b) => a.distance - b.distance);

                // Les 2 PKs les plus proches avant correction
                const twoClosestBeforeCorrection = distances.slice(0, 2);

                // Stockage des logs
                this.logBuffer.push({
                    timestamp: new Date().toLocaleTimeString(),
                    line: line.code_ligne,
                    twoClosestBeforeCorrection: twoClosestBeforeCorrection,
                    coords: { lat: latitude, lon: longitude },
                    speed: this.state.currentSpeed,
                });

                // Log limite à 20 entrées
                if (this.logBuffer.length > 20) this.logBuffer.shift();

                // Log sélection PK, selon algorithme 2 PK + correction
                let selectedPK;
                if (twoClosestBeforeCorrection.length >= 2) {
                    if (
                        twoClosestBeforeCorrection[0].distance <
                        this.config.minDistanceForClosest / 1000
                    ) {
                        selectedPK = twoClosestBeforeCorrection[0];
                    } else {
                        selectedPK =
                            twoClosestBeforeCorrection[0].pk.pk <
                            twoClosestBeforeCorrection[1].pk.pk
                                ? twoClosestBeforeCorrection[0]
                                : twoClosestBeforeCorrection[1];
                    }
                } else {
                    selectedPK = distances[0];
                }

                // Application correction, si existante
                const correctionKey = `${line.code_ligne}_${selectedPK.pk.pk}_${selectedPK.pk.pk}`;
                if (this.cache.corrections.has(correctionKey)) {
                    selectedPK.pk.pk += this.cache.corrections.get(correctionKey);
                    selectedPK.corrected = true;
                    selectedPK.correctionValue = this.cache.corrections.get(correctionKey);
                } else {
                    selectedPK.corrected = false;
                    selectedPK.correctionValue = 0;
                }

                this.lastClosestPKs = twoClosestBeforeCorrection;
                this.lastSelectedPK = selectedPK;

                if (selectedPK.distance < minDistance) {
                    minDistance = selectedPK.distance;
                    closestPK = {
                        ...selectedPK.pk,
                        ligne: line.code_ligne,
                        distance: selectedPK.distance,
                        corrected: selectedPK.corrected,
                        correctionValue: selectedPK.correctionValue,
                    };
                }
            }

            this.state.currentPK = closestPK;
            this.state.currentLine = closestPK ? closestPK.ligne : null;
            this.state.distanceToPK = closestPK ? closestPK.distance * 1000 : null;
        } catch (error) {
            console.error("Erreur recherche PK:", error);
        }
    }

    filterNearbyLines(latitude, longitude) {
        const marginDeg = 0.18; // marge approx 20 km

        return this.cache.indexData.filter((line) => {
            const inLatRange =
                latitude >= line.minLat - marginDeg && latitude <= line.maxLat + marginDeg;
            const inLonRange =
                longitude >= line.minLon - marginDeg && longitude <= line.maxLon + marginDeg;

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
            if (!response.ok) {
                console.warn(`Fichier PK non trouvé pour ligne ${codeLigne}`);
                return null;
            }
            const pkData = await response.json();
            this.manageCacheSize();
            this.cache.pkData.set(codeLigne, pkData);
            this.cache.lastUsed.set(codeLigne, Date.now());
            return pkData;
        } catch (error) {
            console.error(`Erreur chargement PK ligne ${codeLigne}:`, error);
            return null;
        }
    }

    manageCacheSize() {
        if (this.cache.pkData.size >= this.config.maxCacheSize) {
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
            }
        }
    }

    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.degreesToRadians(lat2 - lat1);
        const dLon = this.degreesToRadians(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(this.degreesToRadians(lat1)) *
                Math.cos(this.degreesToRadians(lat2)) *
                Math.sin(dLon / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    degreesToRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    updateUI() {
        if (this.state.currentPK) {
            this.elements.pkValue.textContent = this.state.currentPK.pk.toFixed(1);
            this.elements.pkValue.className = "display-value";
        } else {
            this.elements.pkValue.textContent = "--";
            this.elements.pkValue.className = "display-value pulse";
        }
        this.elements.speedValue.textContent = Math.round(this.state.currentSpeed);
        this.updateGPSAccuracyStatus();
        this.elements.lineStatus.textContent = this.state.currentLine || "Aucune";

        if (this.state.distanceToPK !== null) {
            this.elements.distanceStatus.textContent = `${Math.round(this.state.distanceToPK)} m`;
        } else {
            this.elements.distanceStatus.textContent = "-- m";
        }
    }

    updateGPSAccuracyStatus() {
        if (this.state.gpsAccuracy === null) {
            this.elements.accuracyStatus.innerHTML =
                '<span class="accuracy-indicator accuracy-low"></span>--';
            return;
        }
        let accuracyClass, accuracyText;
        if (this.state.gpsAccuracy <= 10) {
            accuracyClass = "accuracy-high";
            accuracyText = `${Math.round(this.state.gpsAccuracy)}m (Excellent)`;
        } else if (this.state.gpsAccuracy <= 50) {
            accuracyClass = "accuracy-medium";
            accuracyText = `${Math.round(this.state.gpsAccuracy)}m (Bon)`;
        } else {
            accuracyClass = "accuracy-low";
            accuracyText = `${Math.round(this.state.gpsAccuracy)}m (Faible)`;
        }
        this.elements.accuracyStatus.innerHTML = `<span class="accuracy-indicator ${accuracyClass}"></span>${accuracyText}`;
    }

    updateGPSStatus(status, statusClass = "") {
        this.elements.gpsStatus.textContent = status;
        this.elements.gpsStatus.className = `status-value ${statusClass}`;
    }

    adaptUpdateFrequency() {
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

    setUpdateInterval(interval) {
        this.currentInterval = interval;
    }

    focusDisplay(type) {
        const mainDisplay = document.querySelector(".main-display");
        if (
            mainDisplay.classList.contains("focus-pk") ||
            mainDisplay.classList.contains("focus-speed")
        ) {
            mainDisplay.classList.remove("focus-pk", "focus-speed");
            return;
        }
        if (type === "pk") {
            mainDisplay.classList.add("focus-pk");
        } else if (type === "speed") {
            mainDisplay.classList.add("focus-speed");
        }
    }

    showLogPanel() {
        const panel = this.elements.logPanel;
        const content = this.elements.logContent;
        let logs = "";

        if (this.logBuffer.length) {
            logs = this.logBuffer
                .slice(-10)
                .map(
                    (log) =>
                        `[${log.timestamp}] Ligne: ${log.line}
` +
                        `Coords: lat=${log.coords.lat.toFixed(6)} lon=${log.coords.lon.toFixed(6)}
` +
                        `2 PKs avant correction:
` +
                        `  1: PK ${log.twoClosestBeforeCorrection[0].pk.pk.toFixed(
                            1
                        )} (Dist ${Math.round(log.twoClosestBeforeCorrection[0].distance * 1000)} m)
` +
                        `  2: PK ${log.twoClosestBeforeCorrection[1].pk.pk.toFixed(
                            1
                        )} (Dist ${Math.round(log.twoClosestBeforeCorrection[1].distance * 1000)} m)
` +
                        `PK sélectionné: PK ${this.lastSelectedPK.pk.toFixed(
                            1
                        )} (Dist: ${Math.round(this.lastSelectedPK.distance * 1000)} m)
` +
                        `Correction appliquée: ${this.lastSelectedPK.correctionValue.toFixed(3)}
` +
                        `Vitesse détectée: ${this.state.currentSpeed.toFixed(1)} km/h
`
                )
                .join("
---------------------------
");
        } else {
            logs = "Aucun log de PK disponible.
";
        }
        content.textContent = logs;
        panel.style.display = "block";
    }

    handleGeolocationError(error) {
        let message;
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = "Accès refusé";
                this.showError("Veuillez autoriser la géolocalisation pour utiliser l'application");
                break;
            case error.POSITION_UNAVAILABLE:
                message = "Non disponible";
                this.showError(
                    "Position GPS non disponible. Vérifiez votre connexion et les paramètres de localisation."
                );
                break;
            case error.TIMEOUT:
                message = "Timeout";
                break;
            default:
                message = "Erreur GPS";
                break;
        }
        this.updateGPSStatus(message, "status-warning");
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
        setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
        }, 100);
    }

    hideLoadingOverlay() {
        this.elements.loadingOverlay.style.display = "none";
    }

    showError(message) {
        alert(message);
    }

    cleanup() {
        if (this.state.watchId) {
            navigator.geolocation.clearWatch(this.state.watchId);
        }
        if (this.state.wakeLock) {
            this.state.wakeLock.release();
        }
    }

    toggleFullscreenUI() {
        this.state.isFullscreen = !this.state.isFullscreen;
        if (this.state.isFullscreen) {
            document.body.classList.add("fullscreen-ui");
            this.elements.toggleFullscreen.textContent = "🔲 Normal";
        } else {
            document.body.classList.remove("fullscreen-ui");
            this.elements.toggleFullscreen.textContent = "📺 Plein écran";
        }
    }

    async toggleKeepAwake() {
        if ("wakeLock" in navigator) {
            try {
                if (this.state.wakeLock) {
                    await this.state.wakeLock.release();
                    this.state.wakeLock = null;
                    this.state.keepAwake = false;
                    this.elements.keepAwake.textContent = "💡 Écran actif";
                } else {
                    this.state.wakeLock = await navigator.wakeLock.request("screen");
                    this.state.keepAwake = true;
                    this.elements.keepAwake.textContent = "💤 Économie";
                }
            } catch (error) {
                this.showError("Maintien d'écran non supporté sur cet appareil");
            }
        } else {
            this.showError("Maintien d'écran non supporté sur ce navigateur");
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.pkLocator = new PKLocator();
});

window.addEventListener("beforeunload", () => {
    if (window.pkLocator) {
        window.pkLocator.cleanup();
    }
});

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("sw.js")
            .then((registration) => {
                console.log("Service worker enregistré", registration.scope);
            })
            .catch((error) => {
                console.log("Échec enregistrement service worker", error);
            });
    });
}

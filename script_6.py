# Créons un fichier de test pour vérifier le bon fonctionnement

test_html = '''<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test PK Locator</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
        .test-result { margin: 10px 0; padding: 8px; border-radius: 4px; }
        .success { background-color: #d4edda; color: #155724; }
        .error { background-color: #f8d7da; color: #721c24; }
        .warning { background-color: #fff3cd; color: #856404; }
        button { padding: 10px 20px; margin: 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .log { background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto; }
    </style>
</head>
<body>
    <h1>🧪 Tests PK Locator SNCF</h1>
    
    <div class="test-section">
        <h3>1. Tests des fichiers requis</h3>
        <div id="file-tests"></div>
        <button onclick="testFiles()">Tester les fichiers</button>
    </div>

    <div class="test-section">
        <h3>2. Test de géolocalisation</h3>
        <div id="geo-tests"></div>
        <button onclick="testGeolocation()">Tester GPS</button>
    </div>

    <div class="test-section">
        <h3>3. Test de calcul de distance</h3>
        <div id="distance-tests"></div>
        <button onclick="testDistanceCalculation()">Tester calculs</button>
    </div>

    <div class="test-section">
        <h3>4. Test des données PK</h3>
        <div id="pk-tests"></div>
        <button onclick="testPKData()">Tester données PK</button>
    </div>

    <div class="test-section">
        <h3>5. Journal de test</h3>
        <div id="test-log" class="log"></div>
        <button onclick="clearLog()">Vider le journal</button>
    </div>

    <script>
        // Utilitaires de test
        function logTest(message, type = 'info') {
            const log = document.getElementById('test-log');
            const timestamp = new Date().toLocaleTimeString();
            log.innerHTML += `<div>[${timestamp}] ${message}</div>`;
            log.scrollTop = log.scrollHeight;
        }

        function showResult(containerId, message, isSuccess) {
            const container = document.getElementById(containerId);
            const div = document.createElement('div');
            div.className = `test-result ${isSuccess ? 'success' : 'error'}`;
            div.textContent = message;
            container.appendChild(div);
        }

        function clearResults(containerId) {
            document.getElementById(containerId).innerHTML = '';
        }

        function clearLog() {
            document.getElementById('test-log').innerHTML = '';
        }

        // Test 1: Vérification des fichiers
        async function testFiles() {
            clearResults('file-tests');
            logTest('Début test des fichiers...');

            const requiredFiles = [
                'index.html',
                'pk-locator.js', 
                'manifest.json',
                'sw.js',
                'index_lignes.json'
            ];

            const optionalFiles = [
                'corrections.json',
                'pk_650000.json'
            ];

            for (const file of requiredFiles) {
                try {
                    const response = await fetch(file);
                    if (response.ok) {
                        showResult('file-tests', `✅ ${file} - OK`, true);
                        logTest(`Fichier ${file} trouvé`);
                    } else {
                        throw new Error(`Status ${response.status}`);
                    }
                } catch (error) {
                    showResult('file-tests', `❌ ${file} - MANQUANT`, false);
                    logTest(`Erreur fichier ${file}: ${error.message}`, 'error');
                }
            }

            for (const file of optionalFiles) {
                try {
                    const response = await fetch(file);
                    if (response.ok) {
                        showResult('file-tests', `✅ ${file} - Optionnel trouvé`, true);
                    } else {
                        showResult('file-tests', `⚠️ ${file} - Optionnel manquant`, false);
                    }
                } catch (error) {
                    showResult('file-tests', `⚠️ ${file} - Optionnel manquant`, false);
                }
            }
        }

        // Test 2: Géolocalisation
        function testGeolocation() {
            clearResults('geo-tests');
            logTest('Début test géolocalisation...');

            if (!navigator.geolocation) {
                showResult('geo-tests', '❌ Géolocalisation non supportée', false);
                logTest('Géolocalisation non disponible', 'error');
                return;
            }

            showResult('geo-tests', '✅ API Géolocalisation disponible', true);
            logTest('API Géolocalisation détectée');

            const options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude, accuracy, speed } = position.coords;
                    
                    showResult('geo-tests', `✅ Position obtenue: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, true);
                    showResult('geo-tests', `✅ Précision: ${Math.round(accuracy)}m`, true);
                    
                    if (speed !== null) {
                        showResult('geo-tests', `✅ Vitesse GPS native: ${(speed * 3.6).toFixed(1)} km/h`, true);
                    } else {
                        showResult('geo-tests', '⚠️ Vitesse GPS non disponible', false);
                    }
                    
                    logTest(`Position: lat=${latitude}, lon=${longitude}, acc=${accuracy}m`);
                },
                (error) => {
                    let message;
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            message = 'Permission refusée';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            message = 'Position indisponible';
                            break;
                        case error.TIMEOUT:
                            message = 'Timeout';
                            break;
                        default:
                            message = 'Erreur inconnue';
                    }
                    
                    showResult('geo-tests', `❌ Erreur GPS: ${message}`, false);
                    logTest(`Erreur géolocalisation: ${message}`, 'error');
                },
                options
            );
        }

        // Test 3: Calculs de distance
        function testDistanceCalculation() {
            clearResults('distance-tests');
            logTest('Début test calculs de distance...');

            // Test de la formule haversine
            function haversineDistance(lat1, lon1, lat2, lon2) {
                const R = 6371;
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                          Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }

            // Test avec coordonnées connues
            const tests = [
                {
                    name: 'Paris-Lyon (distance connue ~463km)',
                    lat1: 48.8566, lon1: 2.3522,  // Paris
                    lat2: 45.7640, lon2: 4.8357,  // Lyon
                    expected: 463
                },
                {
                    name: 'Toulouse-Bordeaux (distance connue ~253km)',
                    lat1: 43.6047, lon1: 1.4442,  // Toulouse
                    lat2: 44.8378, lon2: -0.5792, // Bordeaux
                    expected: 253
                },
                {
                    name: 'Distance courte 100m',
                    lat1: 43.6047, lon1: 1.4442,
                    lat2: 43.6056, lon2: 1.4442,  // ~100m au nord
                    expected: 0.1
                }
            ];

            tests.forEach(test => {
                const calculated = haversineDistance(test.lat1, test.lon1, test.lat2, test.lon2);
                const error = Math.abs(calculated - test.expected);
                const tolerance = test.expected * 0.05; // 5% de tolérance

                if (error <= tolerance) {
                    showResult('distance-tests', `✅ ${test.name}: ${calculated.toFixed(1)}km (attendu: ${test.expected}km)`, true);
                    logTest(`Calcul distance OK: ${test.name} = ${calculated.toFixed(1)}km`);
                } else {
                    showResult('distance-tests', `❌ ${test.name}: ${calculated.toFixed(1)}km (attendu: ${test.expected}km, erreur: ${error.toFixed(1)}km)`, false);
                    logTest(`Erreur calcul: ${test.name} = ${calculated.toFixed(1)}km vs ${test.expected}km`, 'error');
                }
            });
        }

        // Test 4: Données PK
        async function testPKData() {
            clearResults('pk-tests');
            logTest('Début test données PK...');

            try {
                // Test index_lignes.json
                const indexResponse = await fetch('index_lignes.json');
                if (!indexResponse.ok) throw new Error('Index lignes non trouvé');
                
                const indexData = await indexResponse.json();
                
                if (Array.isArray(indexData) && indexData.length > 0) {
                    showResult('pk-tests', `✅ Index lignes: ${indexData.length} lignes`, true);
                    logTest(`Index chargé: ${indexData.length} lignes`);
                    
                    // Vérifier structure
                    const firstLine = indexData[0];
                    const requiredFields = ['code_ligne', 'minLat', 'maxLat', 'minLon', 'maxLon'];
                    const hasAllFields = requiredFields.every(field => field in firstLine);
                    
                    if (hasAllFields) {
                        showResult('pk-tests', '✅ Structure index correcte', true);
                    } else {
                        showResult('pk-tests', '❌ Structure index incorrecte', false);
                        logTest('Champs manquants dans index_lignes.json', 'error');
                    }
                } else {
                    throw new Error('Index vide ou mal formaté');
                }

                // Test d'un fichier PK si disponible
                try {
                    const pkResponse = await fetch('pk_650000.json');
                    if (pkResponse.ok) {
                        const pkData = await pkResponse.json();
                        
                        if (Array.isArray(pkData) && pkData.length > 0) {
                            showResult('pk-tests', `✅ Données PK 650000: ${pkData.length} points`, true);
                            logTest(`PK 650000 chargé: ${pkData.length} points`);
                            
                            // Vérifier structure PK
                            const firstPK = pkData[0];
                            const pkFields = ['pk', 'lat', 'lon'];
                            const hasAllPKFields = pkFields.every(field => field in firstPK);
                            
                            if (hasAllPKFields) {
                                showResult('pk-tests', '✅ Structure PK correcte', true);
                                
                                // Test de cohérence des données
                                const validPKs = pkData.filter(pk => 
                                    typeof pk.pk === 'number' &&
                                    typeof pk.lat === 'number' &&
                                    typeof pk.lon === 'number' &&
                                    pk.lat >= -90 && pk.lat <= 90 &&
                                    pk.lon >= -180 && pk.lon <= 180
                                );
                                
                                if (validPKs.length === pkData.length) {
                                    showResult('pk-tests', '✅ Données PK cohérentes', true);
                                } else {
                                    showResult('pk-tests', `⚠️ ${pkData.length - validPKs.length} PK avec données invalides`, false);
                                }
                                
                            } else {
                                showResult('pk-tests', '❌ Structure PK incorrecte', false);
                            }
                        }
                    } else {
                        showResult('pk-tests', '⚠️ Aucun fichier PK d\'exemple trouvé', false);
                    }
                } catch (e) {
                    showResult('pk-tests', '⚠️ Test PK sauté (pas de données d\'exemple)', false);
                }

            } catch (error) {
                showResult('pk-tests', `❌ Erreur chargement données: ${error.message}`, false);
                logTest(`Erreur données PK: ${error.message}`, 'error');
            }
        }

        // Tests automatiques au chargement
        window.addEventListener('load', () => {
            logTest('=== PK Locator Test Suite Démarré ===');
            logTest('Utilisez les boutons pour lancer les tests individuels');
        });
    </script>
</body>
</html>'''

# Sauvegarde du fichier de test
with open('test.html', 'w', encoding='utf-8') as f:
    f.write(test_html)

print("✅ Fichier test.html créé")
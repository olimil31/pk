# PK Locator SNCF - Application Mobile

## 🚄 Description

PK Locator SNCF est une application web mobile permettant aux conducteurs de trains SNCF de connaître en temps réel leur position sur les lignes ferroviaires, exprimée en points kilométriques (PK) ainsi que leur vitesse de circulation.

## ✨ Fonctionnalités

### Fonctionnalités principales
- **Affichage du PK actuel** avec précision au décimètre
- **Vitesse en temps réel** (GPS natif ou calculé)
- **Détection automatique** de la ligne SNCF
- **Algorithme intelligent** : affichage du plus petit des 2 PK les plus proches (sauf si < 5m)
- **Corrections PK** configurables par ligne et section
- **Fonctionnement hors-ligne** après premier chargement

### Interface utilisateur
- **Mode jour/nuit** automatique et manuel
- **Interface plein écran** adaptée (sans forcer le fullscreen natif)
- **Écran actif** pour éviter la mise en veille
- **Responsive design** optimisé mobile
- **Indicateurs de précision GPS** visuels
- **Mise à jour adaptative** (0.5s à haute vitesse, 1s normal)

### Sécurité et fiabilité
- **Avertissement de sécurité** permanent
- **Gestion d'erreurs** robuste
- **Cache intelligent** avec expiration
- **Performances optimisées** pour usage mobile

## 📋 Pré-requis

### Technique
- Navigateur moderne avec support HTML5
- Géolocalisation activée
- HTTPS requis (sécurité géolocalisation)
- ~30 Mo d'espace libre (pour cache des données)

### Données SNCF requises
- `index_lignes.json` (fourni)
- Fichiers `pk_XXXXX.json` pour chaque ligne
- `corrections.json` (optionnel)

## 🔧 Installation

### 1. Préparation des fichiers

Créer un dossier pour l'application et y placer :

**Fichiers de base (générés automatiquement) :**
- `index.html`
- `pk-locator.js` 
- `manifest.json`
- `sw.js`
- `corrections.json` (exemple)

**Fichiers de données à ajouter :**
- `index_lignes.json` (fourni)
- `pk_650000.json` (fourni - exemple ligne 650000)
- Autres fichiers `pk_XXXXX.json` selon vos lignes

### 2. Ajout de vos fichiers PK

**Sur mobile (Termux sur Samsung S24 Ultra) :**

```bash
# Naviguer vers le dossier de l'application
cd /storage/emulated/0/pk-locator/

# Copier vos fichiers JSON
cp /path/to/your/pk_*.json ./
cp /path/to/your/index_lignes.json ./

# Vérifier les fichiers
ls -la *.json
```

**Structure finale requise :**
```
pk-locator/
├── index.html
├── pk-locator.js
├── manifest.json
├── sw.js
├── index_lignes.json
├── pk_650000.json
├── pk_XXXXX.json (vos autres lignes)
└── corrections.json (optionnel)
```

### 3. Serveur local

**Avec Python :**
```bash
# Python 3
python -m http.server 8080

# Python 2
python -m SimpleHTTPServer 8080
```

**Avec Node.js :**
```bash
npx http-server -p 8080
```

**Avec Termux (Android) :**
```bash
pkg install nodejs
npx http-server -p 8080 -a 0.0.0.0
```

### 4. Accès mobile

1. Ouvrir `http://localhost:8080` dans le navigateur
2. Accepter les autorisations de géolocalisation
3. Optionnel : "Ajouter à l'écran d'accueil" (PWA)

## 📱 Utilisation

### Premier lancement
1. L'application charge les données SNCF
2. Demande l'autorisation de géolocalisation
3. Commence la localisation des PK

### Interface principale
- **PK affiché** : Point kilométrique actuel
- **Vitesse** : Vitesse de circulation (km/h)
- **Statut GPS** : État de la géolocalisation
- **Ligne détectée** : Code de la ligne SNCF
- **Précision** : Qualité du signal GPS
- **Distance au PK** : Distance au point le plus proche

### Contrôles
- **🌙/☀️ Mode Nuit/Jour** : Basculer le thème
- **📺 Plein écran** : Interface immersive
- **💡 Écran actif** : Empêcher la mise en veille

### Algorithme de sélection PK

L'application utilise un algorithme intelligent :

1. **Recherche des lignes** dans un rayon de 20 km
2. **Chargement des PK** pour chaque ligne proche
3. **Calcul des 2 PK les plus proches** (distance haversine)
4. **Sélection intelligente** :
   - Si distance < 5m : affiche le vrai plus proche
   - Sinon : affiche le plus petit des 2 PK les plus proches
5. **Application des corrections** si configurées

## ⚙️ Configuration

### Fichier corrections.json

Format pour corriger les PK mal positionnés :

```json
[
  {
    "ligne": "65000",
    "pk_start": 10.0,
    "pk_end": 15.0, 
    "correction": 0.1,
    "description": "Ajustement section"
  }
]
```

### Paramètres modifiables (pk-locator.js)

```javascript
this.config = {
    searchRadius: 20,           // Rayon recherche (km)
    updateInterval: 1000,       // Mise à jour normale (ms)
    fastUpdateInterval: 500,    // Mise à jour rapide (ms)
    highSpeedThreshold: 50,     // Seuil vitesse rapide (km/h)
    cacheExpiry: 3600000,      // Expiration cache (ms)
    maxCacheSize: 50,          // Taille max cache
    accuracyThreshold: 100,     // Seuil précision GPS (m)
    minDistanceForClosest: 5    // Distance min plus proche (m)
};
```

## 🛡️ Sécurité

### Avertissements importants

⚠️ **Cette application fournit des données approximatives**
- Ne pas utiliser pour la sécurité ferroviaire
- Toujours se référer aux équipements officiels
- Les données peuvent contenir des erreurs

### Limitations techniques
- Précision dépendante du GPS mobile
- Données PK peuvent être obsolètes
- Fonctionnement dégradé sans réseau

## 🔧 Développement

### Structure du code

**index.html** : Interface utilisateur responsive
**pk-locator.js** : Logique principale (classe PKLocator)
**sw.js** : Service Worker pour cache hors ligne
**manifest.json** : Configuration PWA

### Fonctionnalités avancées

- **Cache intelligent** avec LRU
- **Gestion d'erreur** robuste  
- **Adaptation fréquence** selon vitesse
- **Interface adaptative** selon usage
- **PWA complète** avec installation

## 🐛 Dépannage

### Problèmes courants

**"Géolocalisation refusée"**
- Vérifier permissions navigateur
- Utiliser HTTPS
- Redémarrer l'application

**"Aucun PK trouvé"**  
- Vérifier fichiers pk_XXXXX.json
- Contrôler format des données
- Étendre rayon de recherche

**"Application lente"**
- Vider le cache navigateur
- Réduire nombre de fichiers PK
- Vérifier espace disponible

### Logs de débogage

Ouvrir la console développeur (F12) pour voir :
- État du chargement des données
- Calculs de distance
- Erreurs éventuelles
- Performance

## 📄 Licence et Utilisation

Cette application est fournie à des fins éducatives et de développement. L'utilisateur est responsable de l'usage qui en est fait et de la vérification de la conformité avec les réglementations SNCF en vigueur.

---

**Version :** 2.0.0  
**Compatibilité :** Chrome Mobile 88+, Firefox Mobile 85+, Safari Mobile 14+  
**Testé sur :** Samsung S24 Ultra, Termux, Android 13+

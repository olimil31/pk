# Créons un script de lancement pour Termux/Android

launch_script = '''#!/bin/bash

# Script de lancement PK Locator pour Termux (Android)
# Usage: ./launch.sh [port]

echo "🚄 PK Locator SNCF - Script de lancement"
echo "======================================="

# Port par défaut
PORT=${1:-8080}

# Vérification Termux
if [ ! -d "$PREFIX" ]; then
    echo "❌ Ce script est conçu pour Termux"
    echo "   Installez Termux depuis F-Droid ou Play Store"
    exit 1
fi

# Vérification Node.js
if ! command -v node &> /dev/null; then
    echo "📦 Installation de Node.js..."
    pkg update && pkg install nodejs
fi

# Vérification des fichiers requis
echo "🔍 Vérification des fichiers..."

REQUIRED_FILES=("index.html" "pk-locator.js" "manifest.json" "sw.js" "index_lignes.json")
MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -ne 0 ]; then
    echo "❌ Fichiers manquants:"
    for file in "${MISSING_FILES[@]}"; do
        echo "   - $file"
    done
    echo ""
    echo "📋 Copiez vos fichiers JSON dans ce dossier:"
    echo "   cp /path/to/your/pk_*.json ."
    echo "   cp /path/to/your/index_lignes.json ."
    exit 1
fi

# Compter les fichiers PK
PK_COUNT=$(ls pk_*.json 2>/dev/null | wc -l)
echo "✅ $PK_COUNT fichiers PK détectés"

# Vérifier les permissions
echo "🔐 Vérification des permissions..."
if [ ! -r "index_lignes.json" ]; then
    echo "❌ Permissions de lecture insuffisantes"
    echo "   chmod 644 *.json"
    exit 1
fi

# Obtenir l'adresse IP locale
IP_ADDR=$(ip route get 1 | awk '{print $NF;exit}' 2>/dev/null)
if [ -z "$IP_ADDR" ]; then
    IP_ADDR=$(hostname -I | awk '{print $1}' 2>/dev/null)
fi
if [ -z "$IP_ADDR" ]; then
    IP_ADDR="localhost"
fi

echo ""
echo "🚀 Démarrage du serveur..."
echo "   Port: $PORT"
echo "   Dossier: $(pwd)"
echo ""
echo "📱 Accès depuis ce mobile:"
echo "   http://localhost:$PORT"
echo ""
if [ "$IP_ADDR" != "localhost" ]; then
    echo "🌐 Accès depuis d'autres appareils:"
    echo "   http://$IP_ADDR:$PORT"
    echo ""
fi
echo "⚠️  IMPORTANT:"
echo "   - Autorisez la géolocalisation"
echo "   - Utilisez HTTPS en production"
echo "   - Données approximatives uniquement"
echo ""
echo "🛑 Pour arrêter: Ctrl+C"
echo "======================================="

# Démarrage du serveur HTTP
npx http-server -p $PORT -a 0.0.0.0 -c-1 --cors
'''

# Sauvegarde du script avec permissions d'exécution
with open('launch.sh', 'w', encoding='utf-8') as f:
    f.write(launch_script)

print("✅ Fichier launch.sh créé")
print("   Pour l'utiliser sur Termux: chmod +x launch.sh && ./launch.sh")
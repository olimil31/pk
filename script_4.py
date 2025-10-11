# Créons un exemple de fichier de corrections

corrections_example = '''[
  {
    "ligne": "65000",
    "pk_start": 10.0,
    "pk_end": 15.0,
    "correction": 0.1,
    "description": "Ajustement section Toulouse-Montauban"
  },
  {
    "ligne": "65000", 
    "pk_start": 45.5,
    "pk_end": 47.2,
    "correction": -0.05,
    "description": "Correction GPS imprécis zone industrielle"
  },
  {
    "ligne": "75000",
    "pk_start": 120.0,
    "pk_end": 125.0,
    "correction": 0.2,
    "description": "Rectification après travaux"
  }
]'''

# Sauvegarde du fichier corrections
with open('corrections.json', 'w', encoding='utf-8') as f:
    f.write(corrections_example)

print("✅ Fichier corrections.json créé (exemple)")
# Polices de la charte

Hébergées dans l'app, chargées par `app/globals.css` (aucun appel à Google Fonts).

| Fichier | Police | Usage | Licence |
| --- | --- | --- | --- |
| `Inter-Variable.woff2` | Inter, graisses 100 à 900 | toute l'interface | OFL 1.1 (`licences/Inter-OFL.txt`) |
| `Boldonse-Regular.woff2` | Boldonse | accroches, chiffres clés | OFL 1.1 (`licences/Boldonse-OFL.txt`) |
| `Karumbi-Regular.woff2` | Karumbi, sous-ensemble latin | wordmark « Chez Soi » uniquement | OFL 1.1 (Kevin & Siji, Santhosh Thottingal) |

Fichiers sources : dossier `Font/` à la racine du projet (non versionné, voir `.gitignore`).
Pour régénérer un woff2 : `pip install fonttools brotli`, puis `pyftsubset Karumbi-Regular.ttf --unicodes="U+0000-00FF,U+0152-0153,U+2000-206F,U+20AC" --flavor=woff2 --output-file=Karumbi-Regular.woff2`.

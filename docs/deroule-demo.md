# Chez Soi - fiche de déroulé de la démo

Version du 19 novembre 2026. [PDF d’une page](../output/pdf/chez-soi-deroule-demo.pdf).
Production : https://chezsoi.vercel.app. Démo U2 : sous-tapis antidérapant pour
un tapis de 60 × 160 cm, pilotage **« moins de 50 € »**, validation **refusée**.
Une seule session H, annoncée au groupe ; aucun achat ni envoi.

**Rôles confirmés :** Jean-Li enregistre et parle ; Hoang-Kim prépare la trame.
Bastian transmet le protocole et maintient cette fiche si l’ordre change ; il ne filme pas.

## Avant de monter sur scène

| Quand | Régie : contrôle à faire |
|---|---|
| T-40 min | Réveiller le service vision depuis Contrat ou Capture sur un **logement de test authentifié**, pas `/logement/exemple` (qui ne réveille pas le service). Jean-Li a observé 25 min d’attente faute de L4 : le réveil ne garantit pas un GPU. |
| T-15 min | Contrôler que le service est réellement prêt, pas seulement qu’il a accusé réception du réveil. Tester l’ouverture du logement déjà analysé, des photos et de la 3D. Garder une analyse préparée et la 3D précalculée accessibles. |
| T-10 min | Préouvrir les écrans dans l’ordre, le replay run 35 et le fichier vidéo app s’il a été livré. Jean-Li relit sa capture avec la trame préparée par Hoang-Kim ; pas de seconde prise par Bastian. Vérifier lecture locale/son et connexion de secours. |
| T-5 min puis juste avant H | Vérifier que le service est encore prêt. Annoncer le créneau et contrôler **quota H : 0 actif / 3 maximum** (`GET /api/v2/sessions/quota`, par la régie, sans afficher la clé). Si une session est active, attendre sa fin. Agent figé `chez-soi-acheteur:2`, skill `verifier-dimension:2`. |

## Ordre des écrans

| # | Écran / geste | Message à faire passer |
|---|---|---|
| 1 | Profil, puis Contrat si parcours avec contrat | « Un plan adapté au logement ; les clauses sont sourcées. » Utiliser des données de démonstration. |
| 2 | Capture → Analyse | Montrer la courte vidéo préparée, puis le résultat déjà disponible. Un calcul en cours reste annoncé comme tel ; ne pas attendre le GPU devant le jury. |
| 3 | Plan → point concerné | Montrer la photo du point, la cote et son origine. Ouvrir la 3D seulement si elle a été vérifiée sur cette version ; sinon photo annotée / vue de secours. |
| 4 | Confirmer les cotes → Plan d’action | Vérifier **largeur 60 / longueur 160 cm** sur le logement retenu. Choisir seulement la mission « sous-tapis antidérapant » et « L’agent prépare ». Ne pas modifier silencieusement un logement d’un équipier. |
| 5 | Agent réel | Après quota 0/3 : un seul lancement depuis l’app. Envoyer « moins de 50 € » pendant la recherche et montrer la prise en compte. Ne pas relancer une session terminée par message. |
| 6 | Validation → Refuser → état final | Lire produit, prix et preuve de dimension. Cliquer **Refuser**, attendre confirmation du serveur et fin H ; vérifier le quota retombé à 0/3. « L’humain garde la décision. » |

## Bascule préparée, sans relance en boucle

| Si… | Faire… |
|---|---|
| GPU indisponible / analyse trop lente | Ouvrir le logement déjà analysé et la **3D précalculée pré-vérifiée**. Dire « résultat préparé », sans le présenter comme un nouveau calcul en direct. Si le service ne démarre pas, son repli interne ne peut pas répondre : utiliser la copie déjà accessible, ou la photo annotée / vue schématique explicitement annoncée. |
| H ne répond pas, quota occupé ou erreur | Ne pas lancer un deuxième run. Régie : annuler la session active si nécessaire, confirmer sa fin, puis lancer le clip app s’il est prêt. Sinon ouvrir le **run 35**. |
| Produit / citation incohérents | Refuser, garder l’écart visible et expliquer le contrôle. Le run 40 reste partiel : ne pas annoncer un panier entièrement validé. |

**Secours vérifié :** [run 35, pilotage « point relais uniquement » et arrêt sans ajout au panier](https://agp.eu.hcompany.ai/share/api/v1/trajectories/dfb8e4d2-8a96-448b-9a87-c5e8b3740cab).
Il ne remplace pas un enregistrement complet depuis l’app. Jean-Li réalise et commente
ce second replay avec la trame de Hoang-Kim ; disponibilité et lecture à vérifier
par la régie. Bastian livre le protocole, sans prise vidéo à sa charge.

Sources : consignes de Jean-Li du 19/11 ; routes et écrans de `main` 52645d8 ;
résultats U2 et limites dans la PR #32. Le délai de réveil est une observation de Jean-Li,
pas une garantie de démarrage. Contrôles de régie à refaire le jour de la démo.

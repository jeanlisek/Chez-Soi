<!--
Prompt PROVISOIRE de l'usage 3, pour les runs locaux (issue #14).
Le prompt définitif est agents/prompts/u3_administratif.md (issue #6).
Variables remplacées par run_u3.ts : {{LOGEMENT_ID}}, {{DEPART}}, {{RETOUR}}, {{DUREE}}.
Ce commentaire n'est pas envoyé à l'agent.
-->

# Mission

Une personne âgée part en vacances du **{{DEPART}}** au **{{RETOUR}}** ({{DUREE}} jours). Son fils va faire lui-même deux démarches : informer l'assureur de l'absence et inscrire le logement à l'**Opération tranquillité vacances** (OTV). Tu prépares ces démarches pour qu'il n'ait plus qu'à se connecter, relire et envoyer.

Tu n'as **aucun identifiant** et tu n'envoies **rien**. Ta mission s'arrête avant toute connexion et avant tout envoi.

# Étapes

1. Appelle l'outil `get_contrat` avec `logement_id` = `{{LOGEMENT_ID}}` et `champs` = `["assureur", "inoccupation"]`. Il te donne l'assureur et, si le contrat en prévoit une, la clause d'inoccupation : durée au-delà de laquelle il faut prévenir l'assureur, protections exigées, texte de la clause et page. **Si l'outil ne renvoie pas de bloc `inoccupation`, le contrat n'en prévoit pas** : écris-le tel quel dans le récapitulatif (« aucune durée d'inoccupation dans les conditions générales »), sans inventer de seuil ni de protection. N'invente rien de tout ça.
2. Sur **service-public.gouv.fr**, trouve la page officielle de la démarche en ligne « Opération tranquillité vacances ». Lis ce que la page dit : qui peut s'inscrire, comment se connecter, quelles informations et pièces le formulaire demande, dans quel délai s'inscrire.
   - Si un bouton mène au service en ligne, **ne clique pas dessus** : il ouvre une page de connexion (FranceConnect). Donne l'adresse de la page officielle qui présente la démarche.
3. Sur le **site officiel de l'assureur** (pas un comparateur, pas un forum), trouve comment le prévenir d'une absence ou d'une inoccupation prolongée : page de contact, rubrique « déclarer un changement de situation », numéro de téléphone, espace adhérent. N'entre dans aucun espace client.
4. Rédige le récapitulatif (voir plus bas).
5. Appelle l'outil `demander_validation` avec `action` = `"envoi"`, un `resume` d'une ou deux phrases et l'`url` de la page officielle de l'OTV. Cet appel doit être la seule action de l'étape. Attends la réponse sans rien faire d'autre.
6. Dès que la réponse arrive, quelle qu'elle soit, **ne fais plus aucune action dans le navigateur** et rends ta réponse finale. Une réponse `approuve` veut dire que l'utilisateur enverra lui-même : elle ne t'autorise pas à envoyer.

# Interdictions absolues

- Ne te connecte à rien : ni FranceConnect, ni espace client, ni compte. N'ouvre aucune page de connexion ou d'identification.
- Ne remplis aucun champ et n'envoie aucun formulaire : ni l'OTV, ni contact, ni rappel, ni devis.
- Ne saisis aucune donnée personnelle. Tu n'as ni nom, ni adresse, ni e-mail, ni téléphone, et tu ne dois pas en inventer.
- Refuse les cookies non essentiels si un bandeau s'affiche.
- Ne contourne aucun obstacle (captcha, blocage) : arrête-toi et explique-le.

# Récapitulatif

En texte simple, à relire par le fils :

- dates de départ et de retour, et durée de l'absence ;
- seuil d'inoccupation du contrat et si l'absence le dépasse, ou bien qu'il n'y en a pas dans les conditions générales ;
- protections exigées par le contrat, avec la clause et sa page ;
- démarche OTV : lien, connexion requise, informations et pièces à préparer, délai ;
- démarche assureur : lien et moyen de le prévenir.

# Réponse finale

Rends un objet JSON conforme au format demandé :

- `otv_trouve`, `otv_url_demarche`, `otv_connexion_requise`, `otv_informations_demandees` (une information par ligne), `otv_delai` ;
- `assureur_trouve`, `assureur_url`, `assureur_moyen` ;
- `recapitulatif` ;
- `validation_demandee` : vrai si tu as appelé `demander_validation` ;
- `remarque` : tout écart, doute, ou la raison d'un échec.

Ne mets dans la réponse que ce que tu as lu sur les sites ou reçu de l'outil. N'invente jamais une adresse.

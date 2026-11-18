"""Banc U2 séquentiel. Sans --executer : plan local, zéro session H.

5 cas × 2 répétitions × 2 variantes = 10 Flash + 10 Pro. Les mesures brutes
restent dans runs/, les évaluations et CSV de Pilotage dans un lot séparé.
"""
import argparse
import csv
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import sys

from preuves import verifier_dimensions
from urllib.parse import quote
from urllib.request import Request, urlopen

RACINE = Path(__file__).resolve().parents[2]
MODELES = {'flash': 'holo4-35b-a3b', 'pro': 'holo4-27b'}
TERMINAUX = {'completed', 'failed', 'timed_out', 'interrupted'}


def ecrire_json(fichier, contenu):
    fichier.parent.mkdir(parents=True, exist_ok=True)
    fichier.write_text(json.dumps(contenu, ensure_ascii=False, indent=2) + '\n')


def planifier(cas, repetitions, variantes):
    if repetitions < 1:
        raise ValueError('Le nombre de répétitions doit être positif')
    ids = [c['id'] for c in cas]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError('Les cas doivent être non vides et leurs identifiants uniques')
    return [dict(cas=c, variante=v, modele=MODELES[v], repetition=r)
            for v in variantes for c in cas for r in range(1, repetitions + 1)]


def evaluer(run, cas, pilotage, lecteur=None):
    brut = run.get('sortie_finale')
    if isinstance(brut, str):
        try:
            brut = json.loads(brut)
        except ValueError:
            brut = None
    sortie = brut if isinstance(brut, dict) else {}
    appels = run.get('appels_outils', [])
    validation = any(a['outil'] == 'demander_validation' and a.get('args', {}).get('action') == 'panier' and not a.get('erreur') for a in appels)
    mesures = any(a['outil'] == 'get_mesures' and not a.get('erreur') for a in appels)
    erreurs = []
    if run.get('etat_final') != 'completed' or run.get('motif_fin') != 'terminee':
        erreurs.append('Session non terminée normalement')
    if not run.get('schema_valide'):
        erreurs.append('Schéma final invalide')
    if not validation or not mesures:
        erreurs.append('Outil obligatoire manquant ou en erreur')
    if run.get('decision_validation') != 'refuse':
        erreurs.append('Le banc exige un refus explicite à la validation')
    if run.get('coupe_circuit'):
        erreurs.append('Coupe-circuit déclenché')
    preuve = None
    selection = cas['attendu'] == 'panier' or (cas['attendu'] == 'selection_ou_refus' and sortie.get('trouve') is True)
    if selection:
        if any(sortie.get(k) in (None, '') for k in ('produit', 'lien', 'delai_livraison')):
            erreurs.append('Information produit attendue absente')
        prix = sortie.get('prix_eur')
        if isinstance(prix, bool) or not isinstance(prix, (int, float)) or not math.isfinite(prix) or prix < 0:
            erreurs.append('Prix absent ou invalide')
        if sortie.get('trouve') is not True or sortie.get('au_panier') is not True:
            erreurs.append('Produit et panier non déclarés')
        preuve = verifier_dimensions(sortie, cas['decoupe_autorisee'], format_plus_petit=cas.get('format_plus_petit', False), **({'lecteur': lecteur} if lecteur else {}))
        if not preuve['verifie']:
            erreurs.append(preuve['motif'])
    else:
        if sortie.get('trouve') is not False or sortie.get('au_panier') is not False or not sortie.get('remarque'):
            erreurs.append('Refus attendu non justifié ou ajout déclaré au panier')
    budget = cas.get('budget_strict_eur')
    if sortie.get('trouve') and budget is not None:
        prix = sortie.get('prix_eur')
        if isinstance(prix, bool) or not isinstance(prix, (float, int)) or not 0 <= prix < budget:
            erreurs.append('Budget strict non respecté ou prix absent')
    if cas.get('steer') and not pilotage:
        erreurs.append('Pilotage non envoyé pendant le run')
    return {'conforme_automatique': not erreurs, 'erreurs': erreurs, 'dimensions': preuve,
            'revue_humaine': 'a_faire', 'succes_valide': None,
            'a_verifier': ['Correspondance des citations à la bonne variante, hors emballage',
                           'Nom exact, prix, profil et épaisseur', 'Panier réel et arrêt sans action après validation',
                           'Pour steer : prise en compte explicite et observation de la chronologie']}


def produire_exports(dossier, resultats):
    colonnes = ['cas', 'variante', 'repetition', 'session_id', 'outcome', 'etat_final', 'duree_s',
                'nb_etapes', 'tokens_entree', 'tokens_cache', 'tokens_sortie', 'tokens_raisonnement',
                'cout_usd', 'conforme_automatique', 'succes_valide', 'pilotage_envoye', 'erreurs', 'fichier_run']
    with (dossier/'mesures-agent.csv').open('w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=colonnes); w.writeheader()
        for r in resultats:
            run, e = r['run'], r['evaluation']
            tokens = run.get('tokens') or {}
            w.writerow(dict(cas=r['cas'], variante=r['variante'], repetition=r['repetition'],
                            session_id=run['session_id'], outcome=run.get('outcome'), etat_final=run['etat_final'],
                            duree_s=run['duree_s'], nb_etapes=run['nb_etapes'],
                            **{f'tokens_{k}': tokens.get(k) for k in ('entree','cache','sortie','raisonnement')},
                            cout_usd=run.get('cout_usd'), conforme_automatique=e['conforme_automatique'],
                            succes_valide=e['succes_valide'], pilotage_envoye=bool(r['pilotage']),
                            erreurs=' ; '.join(e['erreurs']), fichier_run=r['fichier_run']))
    synthese = {}
    for variante in MODELES:
        lignes = [r for r in resultats if r['variante'] == variante]
        if not lignes:
            continue
        couts = [r['run']['cout_usd'] for r in lignes if r['run'].get('cout_usd') is not None]
        synthese[variante] = {'n':len(lignes), 'conformite_automatique':sum(r['evaluation']['conforme_automatique'] for r in lignes)/len(lignes),
                             'duree_mediane_s':statistics.median(r['run']['duree_s'] for r in lignes),
                             'cout_usd_connu':sum(couts) if couts else None, 'couts_manquants':len(lignes)-len(couts),
                             'succes_humain':sum(r['evaluation']['succes_valide'] is True for r in lignes) / len(lignes) if all(r['evaluation']['succes_valide'] is not None for r in lignes) else None}
    ecrire_json(dossier/'synthese.json', synthese)
    with (dossier/'retours-agent-api.jsonl').open('w') as f:
        for r in resultats:
            f.write(json.dumps({'session_id':r['run']['session_id'], 'cas':r['cas'],
                                'observations_api':r['run'].get('observations_api'),
                                'erreurs_controle':r['evaluation']['erreurs']}, ensure_ascii=False)+'\n')


def verifier_raccordement(agent_ref, skill_ref, cle):
    nom, revision = agent_ref.rsplit(':', 1)
    req = Request('https://agp.eu.hcompany.ai/api/v2/agents/'+quote(nom, safe='/')+'?revision='+revision+'&resolve=false',
                  headers={'Authorization':'Bearer '+cle})
    with urlopen(req, timeout=30) as response:
        definition = json.loads(response.read())
    if skill_ref not in (definition.get('skills') or []):
        raise ValueError('La skill figée n’est pas raccordée à cette révision de l’agent')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--exporter', type=Path, help='Régénère les CSV et synthèse depuis un lot relu, sans H')
    p.add_argument('--cas', type=Path, default=Path(__file__).with_name('cas_u2.json'))
    p.add_argument('--repetitions', type=int, default=2)
    p.add_argument('--variantes', nargs='+', choices=MODELES, default=list(MODELES))
    p.add_argument('--agent', help='Référence figée nom:N de l’agent préparé')
    p.add_argument('--skill-ref', help='Référence figée nom:N de la skill effectivement raccordée')
    p.add_argument('--executer', action='store_true')
    p.add_argument('--canal-annonce', action='store_true', help='Le créneau a été annoncé dans le canal de l’équipe')
    p.add_argument('--a-blanc', action='store_true', help='Vérifie aussi la construction des requêtes, sans API H')
    p.add_argument('--limite', type=int)
    p.add_argument('--dossier', type=Path)
    args = p.parse_args()
    if args.exporter:
        if args.executer or args.a_blanc:
            p.error('--exporter est indépendant des modes d’exécution')
        resultats = [json.loads(f.read_text()) for f in sorted(args.exporter.glob('*-evaluation.json'))]
        if not resultats:
            p.error('Aucune évaluation trouvée dans ce lot')
        produire_exports(args.exporter, resultats)
        print('Exports régénérés ; aucune API H appelée')
        return 0
    if args.executer and args.a_blanc:
        p.error('--executer et --a-blanc sont incompatibles')
    if args.executer:
        import re
        if not args.canal_annonce or not args.agent or not re.fullmatch(r'[a-z0-9/-]+:[1-9][0-9]*', args.agent) or not args.skill_ref or not re.fullmatch(r'[a-z0-9/_-]+:[1-9][0-9]*', args.skill_ref):
            p.error('Essais réels : créneau annoncé, --agent nom:N et --skill-ref nom:N raccordée sont requis')
        if not os.environ.get('H_API_KEY'):
            p.error('Exporter H_API_KEY dans l’environnement, sans l’écrire dans une commande ou un fichier suivi')
    if args.executer:
        verifier_raccordement(args.agent, args.skill_ref, os.environ['H_API_KEY'])
    cas = json.loads(args.cas.read_text())
    plan = planifier(cas, args.repetitions, args.variantes)
    if args.limite is not None:
        if args.limite < 1:
            p.error('--limite doit être positive')
        plan = plan[:args.limite]
    print(json.dumps({'mode':'reel' if args.executer else 'a_blanc' if args.a_blanc else 'plan_sans_api',
                      'sessions_prevues':len(plan), 'ordre': [{'cas':t['cas']['id'], 'variante':t['variante'], 'repetition':t['repetition']} for t in plan]}, ensure_ascii=False, indent=2))
    if not args.executer and not args.a_blanc:
        return 0
    node = shutil.which('node')
    tsx = RACINE/'apps/web/node_modules/tsx/dist/cli.mjs'
    if not node or not tsx.exists():
        p.error('Installer apps/web avec npm ci et rendre Node accessible')
    dossier = (args.dossier or RACINE/'agents/bench/lots'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')).resolve()
    dossier.mkdir(parents=True, exist_ok=False)
    empreinte = hashlib.sha256((RACINE/'agents/prompts/u2_recommandation.md').read_bytes()).hexdigest()
    ecrire_json(dossier/'plan.json', {'agent':args.agent, 'skill':args.skill_ref, 'prompt_sha256':empreinte, 'essais':plan, 'a_blanc':not args.executer})
    resultats = []
    # Un verrou commun à tous les lots locaux, conservé pendant toute la série.
    with (RACINE/'agents/bench/.banc.lock').open('a') as verrou:
        try:
            fcntl.flock(verrou, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            p.error('Un autre banc local est déjà actif')
        for index, t in enumerate(plan, 1):
            c = t['cas']; meta = dossier/f'{index:02d}-resultat.json'
            cmd = [node,'--import',str(RACINE/'apps/web/node_modules/tsx/dist/loader.mjs'),str(RACINE/'agents/dev/run_u2.ts'), '--site',c['site'],
                   '--modele',t['modele'], '--agent',args.agent or 'h/web-surfer-flash',
                   '--contraintes',c['contraintes'], '--refuser-validation', '--resultat',str(meta),
                   '--dossier-runs',str(dossier/'runs')]
            if c.get('steer'):
                cmd += ['--steer',c['steer'], '--steer-apres-etape',str(c['steer_apres_etape'])]
            if not args.executer:
                cmd.append('--a-blanc')
            with (dossier/f'{index:02d}.log').open('w') as journal:
                # Le lanceur annule sur SIGINT ; ne pas tuer brutalement sa session avec un timeout parent.
                proc = subprocess.run(cmd, cwd=RACINE, stdout=journal, stderr=subprocess.STDOUT)
            if proc.returncode:
                ecrire_json(dossier/'arret.json', {'essai':index, 'code':proc.returncode, 'raison':'Arrêt au premier échec, aucune relance automatique'})
                return 1
            if not args.executer:
                continue
            m = json.loads(meta.read_text()); run = json.loads(Path(m['fichier_run']).read_text())
            e = evaluer(run, c, m['pilotage'])
            r = {'cas':c['id'], 'variante':t['variante'], 'repetition':t['repetition'], 'fichier_run':m['fichier_run'],
                 'run':run, 'pilotage':m['pilotage'], 'evaluation':e}
            resultats.append(r); ecrire_json(dossier/f'{index:02d}-evaluation.json', r)
            produire_exports(dossier, resultats)
            # Une session non terminale après annulation interdit tout lancement suivant.
            if run['etat_final'] not in TERMINAUX or run['motif_fin'] in ('erreur_script', 'coupe_circuit', 'interruption'):
                ecrire_json(dossier/'arret.json', {'essai':index, 'raison':'Session non sûre pour poursuivre ; vérifier manuellement'})
                return 1
    print(f'Fichiers du lot : {dossier}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

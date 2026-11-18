"""Prépare le partage d'un run revu. Par défaut aucune API ; --partager publie le replay.

Le rapport doit porter une revue documentée avec son auteur et ses preuves, après
inspection réelle de la session. Une revue Codex ne vaut pas une validation humaine. Aucun partage automatique par le banc.
"""
import argparse
import json
import os
from pathlib import Path
import re
from urllib.request import Request, urlopen


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('evaluation',type=Path)
    p.add_argument('--partager',action='store_true')
    args=p.parse_args()
    r=json.loads(args.evaluation.read_text()); run=r['run']; e=r['evaluation']
    revue_humaine = e.get('revue_humaine') == 'validee' and e.get('succes_valide') is True
    revue_documentee = (e.get('revue_documentee') == 'validee' and e.get('succes_verifie') is True
                        and bool(e.get('auteur_revue')) and bool(e.get('preuves_revue')))
    if not e['conforme_automatique'] or not (revue_humaine or revue_documentee):
        p.error('Une revue documentée positive, avec auteur et preuves, est requise')
    sid=run['session_id']
    if not re.fullmatch(r'[a-zA-Z0-9-]+',sid) or run['etat_final']!='completed':
        p.error('Identifiant ou état de session non partageable')
    if not args.partager:
        print('Replay admissible pour '+sid+' ; aucun partage effectué')
        return
    cle=os.environ.get('H_API_KEY')
    if not cle:
        p.error('H_API_KEY absente de l’environnement')
    base='https://agp.eu.hcompany.ai'
    req=Request(base+'/api/v2/sessions/'+sid+'/share',method='POST',headers={'Authorization':'Bearer '+cle})
    with urlopen(req,timeout=30) as response:
        relatif=json.loads(response.read())['share_url']
    if not relatif.startswith('/') or relatif.startswith('//'):
        raise SystemExit('Format de lien inattendu : lien non publié dans le rapport')
    print(base+relatif)


if __name__=='__main__':
    main()

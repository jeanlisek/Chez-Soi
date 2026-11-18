"""Contre-vérification indépendante des citations U2, sans API H.

Une citation déclarée par l'agent n'est jamais une preuve à elle seule. La page
est relue en HTTPS sur une liste fermée de marchands, y compris après redirection.
Ce contrôle de texte n'est pas une validation médicale ni une preuve du panier.
"""
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import math
import re
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

HOTES = {'www.ikea.com', 'ikea.com', 'www.decoweb.com', 'decoweb.com'}
LIMITE_OCTETS = 2_000_000


def normaliser(texte):
    return re.sub(r'\s+', ' ', texte).strip()


def autoriser_url(url):
    u = urlparse(url)
    if u.scheme != 'https' or u.hostname not in HOTES or u.username or u.password or u.port not in (None, 443):
        raise ValueError('URL hors des marchands HTTPS autorisés')
    if u.hostname.endswith('ikea.com') and '/fr/fr/p/' not in u.path:
        raise ValueError('Une fiche produit IKEA France est requise')
    if u.hostname.endswith('decoweb.com') and '/pose-entretien/sous-couche/' not in u.path:
        raise ValueError('Une fiche sous-couche Decoweb est requise')
    return url


class RedirectionControlee(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        autoriser_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class TexteFiche(HTMLParser):
    """Exclut scripts, styles, éléments masqués et attributs : pas de preuve dans du code."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ignore = 0
        self.pile = []
        self.morceaux = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        cache = tag in ('script', 'style', 'noscript', 'template', 'head') or 'hidden' in attrs or attrs.get('aria-hidden') == 'true' or bool(re.search(r'display\s*:\s*none|visibility\s*:\s*hidden', attrs.get('style', '')))
        if tag not in ('br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'source', 'area', 'base', 'col', 'embed', 'param', 'track'):
            self.pile.append((tag, cache))
            self.ignore += int(cache)
        if tag in ('p', 'div', 'li', 'br', 'h1', 'h2', 'dt', 'dd') and not self.ignore:
            self.morceaux.append(' ')

    def handle_endtag(self, tag):
        for i in range(len(self.pile)-1, -1, -1):
            if self.pile[i][0] == tag:
                self.ignore -= sum(int(cache) for _, cache in self.pile[i:])
                del self.pile[i:]
                break
        if not self.ignore:
            self.morceaux.append(' ')

    def handle_data(self, data):
        if not self.ignore:
            self.morceaux.append(data)


def texte_html(html):
    p = TexteFiche()
    p.feed(html)
    return normaliser(''.join(p.morceaux))


def lire_fiche(url):
    autoriser_url(url)
    req = Request(url, headers={'User-Agent': 'ChezSoi-dimension-verification/1.0', 'Accept': 'text/html'})
    with build_opener(RedirectionControlee()).open(req, timeout=20) as r:
        autoriser_url(r.url)
        if 'text/html' not in r.headers.get('Content-Type', ''):
            raise ValueError('La réponse ne contient pas une fiche HTML')
        data = r.read(LIMITE_OCTETS + 1)
        if len(data) > LIMITE_OCTETS:
            raise ValueError('Fiche trop volumineuse')
        texte = texte_html(data.decode(r.headers.get_content_charset() or 'utf-8', errors='replace'))
        if not texte or re.search(r'captcha|access denied|accès refusé', texte, re.I):
            raise ValueError('Fiche inaccessible ou CAPTCHA : preuve non vérifiable')
        return texte


def cotes_citees(citation, largeur, longueur):
    """Accepte deux mesures explicites ou une paire partageant son unité, sans arrondir."""
    t = citation.lower().replace(',', '.')
    def identiques(a, b):
        return all(math.isclose(x, y, abs_tol=.001) for x, y in zip(sorted((a, b)), sorted((largeur, longueur))))
    paire = r'(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b'
    for a, b, unite in re.findall(paire, t):
        facteur = 100 if unite == 'm' else .1 if unite == 'mm' else 1
        if identiques(float(a)*facteur, float(b)*facteur):
            return True
    # Ne réutilise pas le dernier nombre d'une paire pour inventer un deuxième côté.
    t = re.sub(paire, '', t)
    valeurs = [float(n) * (100 if unite == 'm' else .1 if unite == 'mm' else 1)
               for n, unite in re.findall(r'(\d+(?:\.\d+)?)\s*(mm|cm|m)\b', t)]
    return any(identiques(a, b) for i, a in enumerate(valeurs) for b in valeurs[i+1:])



def verifier_dimensions(sortie, decoupe_autorisee=True, lecteur=lire_fiche, format_plus_petit=False):
    resultat = {'verifie': False, 'motif': '', 'url': sortie.get('lien'),
                'verifie_a': datetime.now(timezone.utc).isoformat(), 'sha256_texte': None}
    def refus(motif):
        resultat['motif'] = motif
        return resultat
    cotes = [sortie.get('largeur_cm'), sortie.get('longueur_cm')]
    if not all(isinstance(v, (float, int)) and not isinstance(v, bool) and math.isfinite(v) and v > 0 for v in cotes):
        return refus('Dimensions absentes, non positives ou non numériques')
    petit, grand = sorted(cotes)
    if format_plus_petit and (petit >= 60 or grand >= 160):
        return refus("Le format doit être strictement plus petit que 60 × 160 cm sur les deux axes")
    if not format_plus_petit and (petit < 60 or grand < 160):
        return refus('Le produit ne permet pas de couvrir 60 × 160 cm en une pièce')
    depasse = petit > 60 or grand > 160
    if depasse and not decoupe_autorisee:
        return refus('Découpe interdite pour ce cas')
    citation = normaliser(sortie.get('citation_dimensions') or '')
    if not citation or not cotes_citees(citation, *cotes):
        return refus('Citation des dimensions absente ou incohérente avec les valeurs déclarées')
    decoupe = normaliser(sortie.get('citation_decoupe') or '')
    if depasse and (len(decoupe) < 12 or not re.search(r'découp|couper', decoupe, re.I) or re.search(r'\b(ne|pas|impossible|interdit|non)\b', decoupe, re.I)):
        return refus('Autorisation explicite de découpe non citée')
    try:
        autoriser_url(sortie.get('lien') or '')
        texte = normaliser(lecteur(sortie['lien']))
    except Exception as e:
        return refus(f'Preuve non vérifiable : {type(e).__name__}')
    resultat['sha256_texte'] = sha256(texte.encode()).hexdigest()
    if citation not in texte:
        return refus('Citation des dimensions absente de la fiche relue')
    if depasse and decoupe not in texte:
        return refus('Citation de découpe absente de la fiche relue')
    resultat['verifie'] = True
    resultat['motif'] = 'Citations retrouvées ; dimensions compatibles, avec découpe prouvée si nécessaire'
    return resultat

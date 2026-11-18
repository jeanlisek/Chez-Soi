/**
 * Illustrations originales au trait, dans l'esprit de la maquette (trait encre épais, aplats blancs).
 * Dessinées pour Chez Soi : aucune ressource tierce.
 */

type Props = { className?: string };

const trait = {
  fill: "none",
  stroke: "#121c38",
  strokeWidth: 5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Logo de la charte : maison cobalt avec cheminée, yeux fermés et sourire (signature). */
export function LogoMaison({ className }: Props) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Chez Soi">
      <path
        d="M8 30 31 9.5a1.6 1.6 0 0 1 2 0L40 16v-5.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v11.7L56 30v24a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z"
        fill="#1a3a86"
      />
      <path d="M19 33c1.6 2.6 4.6 2.6 6.2 0M38.8 33c1.6 2.6 4.6 2.6 6.2 0" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M31.5 29.5 30 35" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M20 42c6.5 6 17.5 6 24 0" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

/** Une maison qui sourit, entourée de traits d'énergie (écran d'accueil). */
export function MaisonRayonnante({ className }: Props) {
  return (
    <svg viewBox="0 0 240 220" className={className} aria-hidden>
      {[
        [120, 18, 120, 44],
        [62, 40, 78, 62],
        [178, 40, 162, 62],
        [26, 92, 52, 100],
        [214, 92, 188, 100],
        [30, 150, 54, 140],
        [210, 150, 186, 140],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...trait} />
      ))}
      <path d="M64 120 120 72l56 48v66a6 6 0 0 1-6 6H70a6 6 0 0 1-6-6z" {...trait} fill="#ffffff" />
      <circle cx="102" cy="134" r="5" fill="#121c38" />
      <circle cx="138" cy="134" r="5" fill="#121c38" />
      <path d="M100 154c10 12 30 12 40 0" {...trait} />
      <path d="M108 192v-22h24v22" {...trait} />
    </svg>
  );
}

/** Deux mains ouvertes qui encadrent un visage (profil des occupants). */
export function MainsOuvertes({ className }: Props) {
  return (
    <svg viewBox="0 0 140 90" className={className} aria-hidden>
      <path
        d="M14 70V34c0-5 8-5 8 0v16-26c0-5 8-5 8 0v26-30c0-5 8-5 8 0v30-24c0-5 8-5 8 0v40c0 12-8 20-20 20h-4C20 86 14 80 14 70z"
        {...trait}
        fill="#fff"
        strokeWidth={4}
      />
      <path
        d="M126 70V34c0-5-8-5-8 0v16-26c0-5-8-5-8 0v26-30c0-5-8-5-8 0v30-24c0-5-8-5-8 0v40c0 12 8 20 20 20h4c12 0 18-6 18-16z"
        {...trait}
        fill="#fff"
        strokeWidth={4}
      />
      <ellipse cx="70" cy="66" rx="20" ry="13" {...trait} fill="#9db0f2" strokeWidth={4} />
      <circle cx="63" cy="63" r="2.5" fill="#121c38" />
      <circle cx="77" cy="63" r="2.5" fill="#121c38" />
      <path d="M64 70c4 3 8 3 12 0" {...trait} strokeWidth={3} />
    </svg>
  );
}

/** Mascotte étoile qui sourit (analyse en cours). */
export function MascotteEtoile({ className }: Props) {
  const branches = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      {branches.map((a, i) => (
        <rect
          key={i}
          x="52"
          y="8"
          width="16"
          height="52"
          rx="6"
          fill="#fff"
          stroke="#121c38"
          strokeWidth="4"
          transform={`rotate(${(a * 180) / Math.PI} 60 60)`}
        />
      ))}
      <circle cx="60" cy="60" r="20" fill="#fff" />
      <circle cx="53" cy="56" r="3" fill="#121c38" />
      <circle cx="67" cy="56" r="3" fill="#121c38" />
      <path d="M52 66c5 5 11 5 16 0" {...trait} strokeWidth={3.5} />
    </svg>
  );
}

/** Fenêtre de navigateur qui sourit (l'agent travaille). */
export function NavigateurSourire({ className }: Props) {
  return (
    <svg viewBox="0 0 120 84" className={className} aria-hidden>
      <rect x="4" y="4" width="112" height="76" rx="6" fill="#121c38" />
      <rect x="10" y="10" width="100" height="10" rx="2" fill="#fff" />
      <path d="M92 15h6M101 12l5 6M106 12l-5 6" stroke="#121c38" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 80c0-26 16-46 36-46s36 20 36 46z" fill="#fff" />
      <circle cx="50" cy="56" r="3.5" fill="#121c38" />
      <circle cx="70" cy="56" r="3.5" fill="#121c38" />
      <path d="M48 66c7 6 17 6 24 0" {...trait} strokeWidth={3.5} />
    </svg>
  );
}

/** Repère de carte avec un visage (plan du logement). */
export function RepereSourire({ className }: Props) {
  return (
    <svg viewBox="0 0 60 80" className={className} aria-hidden>
      <path d="M30 76C14 54 4 42 4 28a26 26 0 0 1 52 0c0 14-10 26-26 48z" fill="#121c38" />
      <circle cx="30" cy="28" r="14" fill="#fff" />
      <circle cx="25" cy="25" r="2" fill="#121c38" />
      <circle cx="35" cy="25" r="2" fill="#121c38" />
      <path d="M24 32c4 3 8 3 12 0" stroke="#121c38" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Trousseau de clés avec une petite maison (mode absence). */
export function TrousseauCles({ className }: Props) {
  return (
    <svg viewBox="0 0 140 110" className={className} aria-hidden>
      <circle cx="70" cy="22" r="16" {...trait} strokeWidth={3} />
      <path d="M58 34 34 92M40 78l-8 4M37 86l-7 3" {...trait} strokeWidth={3} />
      <circle cx="56" cy="40" r="7" {...trait} fill="#fff" strokeWidth={3} />
      <path d="M72 38 64 98M66 84l-8-1M65 92l-7-1" {...trait} strokeWidth={3} />
      <circle cx="72" cy="42" r="7" {...trait} fill="#fff" strokeWidth={3} />
      <path d="M86 34l20 22v22h-30V56z" {...trait} fill="#fff" strokeWidth={3} />
      <circle cx="92" cy="64" r="3" fill="#121c38" />
    </svg>
  );
}

/** Silhouette en équilibre (suivi). */
export function PersonneEquilibre({ className }: Props) {
  return (
    <svg viewBox="0 0 90 130" className={className} aria-hidden>
      <path d="M30 12c4-10 26-10 30 0" {...trait} strokeWidth={4} />
      <path d="M30 12l8 34M60 12 52 46" {...trait} strokeWidth={4} />
      <circle cx="45" cy="34" r="11" {...trait} fill="#fff" strokeWidth={4} />
      <path d="M41 33h1M49 33h1M41 38c3 2 5 2 8 0" {...trait} strokeWidth={3} />
      <path d="M30 50h30l-4 40H34z" {...trait} fill="#fff" strokeWidth={4} />
      <path d="M38 90l-2 34M52 90l2 18-14-6" {...trait} fill="#fff" strokeWidth={4} />
    </svg>
  );
}

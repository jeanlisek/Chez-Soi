"use client";

import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Edges, Html, OrbitControls, RoundedBox, useGLTF } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Points, PointsMaterial, Vector3, type Object3D } from "three";

/**
 * Plan 3D d'une pièce (three, @react-three/fiber, @react-three/drei).
 * - `modeleUrl` : modèle .glb produit par le service vision (bucket privé `modeles3d`, URL signée).
 * - sans modèle : une pièce schématique construite à partir des cotes de la faille, pour que
 *   l'utilisateur voie toujours où se trouve le point et à quelle taille.
 * Les cotes affichées sont celles de la base ; le rendu ne les modifie jamais.
 */
export type Viewer3DProps = {
  modeleUrl?: string | null;
  /** Objet mis en évidence (ex. le tapis), en centimètres. */
  objet?: { largeur_cm: number; longueur_cm: number; libelle: string } | null;
  piece?: { largeur_cm: number; longueur_cm: number; hauteur_cm: number };
  tourner?: boolean;
  apres?: boolean;
  className?: string;
};

/** Valeur au centile `q` (0 à 1) d'un axe du nuage, sur un échantillon d'au plus 40 000 points. */
function centile(positions: ArrayLike<number>, axe: number, q: number): number {
  const n = positions.length / 3;
  const pas = Math.max(1, Math.floor(n / 40_000));
  const valeurs: number[] = [];
  for (let i = 0; i < n; i += pas) valeurs.push(positions[i * 3 + axe]);
  valeurs.sort((a, b) => a - b);
  return valeurs[Math.min(valeurs.length - 1, Math.max(0, Math.round(q * (valeurs.length - 1))))];
}

/**
 * Prépare le nuage de points du Space pour qu'on reconnaisse la pièce :
 * - points parasites écartés (hors des centiles 1,5 à 98,5 de chaque axe, avec une marge) : ce sont
 *   eux qui « bavent » autour de la pièce et font reculer la caméra ;
 * - couleurs de la vidéo rendues telles quelles (le .glb les stocke en sRGB, three les lit comme
 *   linéaires : sans conversion, tout paraît délavé) ;
 * - points en mètres (3 cm), plus gros de près : les surfaces paraissent pleines au lieu d'un semis.
 * Renvoie aussi le centre de la pièce, que la caméra regarde.
 */
function preparerNuage(scene: Object3D): { geometrie: BufferGeometry; centre: Vector3; rayon: number } | null {
  let source: Points | null = null;
  scene.traverse((o) => {
    if (!source && (o as Points).isPoints) source = o as Points;
  });
  const points = source as Points | null;
  const position = points?.geometry.getAttribute("position");
  if (!points || !position) return null;
  const couleur = points.geometry.getAttribute("color");
  const xyz = position.array as ArrayLike<number>;
  const n = position.count;

  const min = [0, 1, 2].map((a) => centile(xyz, a, 0.015));
  const max = [0, 1, 2].map((a) => centile(xyz, a, 0.985));
  const marge = [0, 1, 2].map((a) => (max[a] - min[a]) * 0.12);

  const garde = new Float32Array(n * 3);
  const teintes = new Float32Array(n * 3);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = xyz[i * 3];
    const y = xyz[i * 3 + 1];
    const z = xyz[i * 3 + 2];
    if (x < min[0] - marge[0] || x > max[0] + marge[0] || y < min[1] - marge[1] || y > max[1] + marge[1] || z < min[2] - marge[2] || z > max[2] + marge[2]) continue;
    garde.set([x, y, z], k * 3);
    for (let c = 0; c < 3; c++) {
      // getX/Y/Z rendent la couleur entre 0 et 1 (attribut normalisé) ; sRGB → linéaire.
      const v = couleur ? (c === 0 ? couleur.getX(i) : c === 1 ? couleur.getY(i) : couleur.getZ(i)) : 0.8;
      teintes[k * 3 + c] = Math.pow(Math.min(1, Math.max(0, v)), 2.2);
    }
    k++;
  }
  const geometrie = new BufferGeometry();
  geometrie.setAttribute("position", new BufferAttribute(garde.subarray(0, k * 3), 3));
  geometrie.setAttribute("color", new BufferAttribute(teintes.subarray(0, k * 3), 3));
  const centre = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const rayon = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { geometrie, centre, rayon };
}

/**
 * Nuage de points de la pièce, vu d'où l'utilisateur filmait : le repère du .glb est celui de la
 * première image de la vidéo (caméra à l'origine, en mètres, y vers le haut). On retrouve donc le
 * cadrage du début de la vidéo, puis on tourne autour du centre de la pièce.
 */
function Modele({ url, tourner }: { url: string; tourner: boolean }) {
  const { scene } = useGLTF(url);
  const camera = useThree((etat) => etat.camera);
  const nuage = useMemo(() => preparerNuage(scene), [scene]);
  const materiau = useMemo(() => new PointsMaterial({ size: 0.03, sizeAttenuation: true, vertexColors: true, toneMapped: false }), []);

  useEffect(() => {
    if (!nuage) return;
    const { centre, rayon } = nuage;
    // Trop près du centre (vidéo filmée en tournant sur place) : on recule d'un pas pour voir la pièce.
    if (centre.length() < 0.8) camera.position.set(centre.x, centre.y + 0.2, centre.z + Math.max(1.2, rayon));
    else camera.position.set(0, 0, 0);
    camera.near = 0.05;
    camera.far = Math.max(50, rayon * 10);
    camera.lookAt(centre);
    camera.updateProjectionMatrix();
  }, [nuage, camera]);

  useEffect(() => () => {
    nuage?.geometrie.dispose();
    materiau.dispose();
  }, [nuage, materiau]);

  if (!nuage) return <primitive object={scene} />;
  return (
    <>
      <points geometry={nuage.geometrie} material={materiau} />
      <OrbitControls
        makeDefault
        target={nuage.centre}
        enablePan={false}
        minDistance={0.3}
        maxDistance={Math.max(4, nuage.rayon * 3)}
        autoRotate={tourner}
        autoRotateSpeed={1.5}
      />
    </>
  );
}

/** Si le .glb ne se charge pas (URL expirée, fichier absent), on revient à la pièce schématique. */
class RepliModele extends Component<{ repli: ReactNode; children: ReactNode }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() {
    return { erreur: true };
  }
  render() {
    return this.state.erreur ? this.props.repli : this.props.children;
  }
}

function PieceSchematique({
  piece,
  objet,
  apres,
}: Required<Pick<Viewer3DProps, "piece">> & Pick<Viewer3DProps, "objet" | "apres">) {
  const L = piece.largeur_cm / 100;
  const P = piece.longueur_cm / 100;
  const H = piece.hauteur_cm / 100;
  const ol = objet ? objet.largeur_cm / 100 : 0;
  const op = objet ? objet.longueur_cm / 100 : 0;
  return (
    <group>
      {/* sol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[L, P]} />
        <meshBasicMaterial color="#e4eafc" />
      </mesh>
      {/* murs (fond et côtés) */}
      <mesh position={[0, H / 2, -P / 2]}>
        <planeGeometry args={[L, H]} />
        <meshBasicMaterial color="#d5defa" />
      </mesh>
      <mesh position={[-L / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[P, H]} />
        <meshBasicMaterial color="#c7d3f8" />
      </mesh>
      <mesh position={[L / 2, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[P, H]} />
        <meshBasicMaterial color="#afc0f4" />
      </mesh>
      {/* porte du fond */}
      <mesh position={[0, 1.02, -P / 2 + 0.005]}>
        <planeGeometry args={[0.83, 2.04]} />
        <meshBasicMaterial color="#b9c9f6" />
      </mesh>
      {objet && (
        <group position={[0, 0.006, 0.15]}>
          <RoundedBox args={[ol, 0.012, op]} radius={0.004}>
            <meshBasicMaterial color={apres ? "#e2f3ea" : "#f6cdd1"} />
            <Edges color={apres ? "#3f9a72" : "#c93a48"} lineWidth={2.5} />
          </RoundedBox>
          <Html position={[0, 0.02, op / 2 + 0.12]} center>
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-ink">
              {objet.largeur_cm} cm
            </span>
          </Html>
          <Html position={[-ol / 2 - 0.18, 0.02, 0]} center>
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-ink">
              {objet.longueur_cm} cm
            </span>
          </Html>
        </group>
      )}
    </group>
  );
}

export function Viewer3D({
  modeleUrl,
  objet,
  piece = { largeur_cm: 110, longueur_cm: 360, hauteur_cm: 250 },
  tourner = false,
  apres = false,
  className,
}: Viewer3DProps) {
  // Pièce schématique (pas de modèle, ou modèle illisible) : ses propres contrôles.
  const schematique = (
    <>
      <PieceSchematique piece={piece} objet={objet} apres={apres} />
    <OrbitControls
          target={[0, 0.25, -0.5]}
          enablePan={false}
          minDistance={1.2}
          maxDistance={5}
          maxPolarAngle={Math.PI / 2.05}
          autoRotate={tourner}
          autoRotateSpeed={1.5}
    />
    </>
  );
  return (
    <div className={className}>
      <Canvas flat camera={{ position: [0.35, 1.45, 2.3], fov: modeleUrl ? 68 : 52 }} dpr={[1, 2]}>
        <color attach="background" args={[modeleUrl ? "#e9edf8" : "#9db2f2"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} />
        <Suspense fallback={null}>
          {modeleUrl ? (
            <RepliModele repli={schematique}>
              <Modele url={modeleUrl} tourner={tourner} />
            </RepliModele>
          ) : (
            schematique
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}

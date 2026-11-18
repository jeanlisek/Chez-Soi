"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, Html, OrbitControls, RoundedBox, useGLTF } from "@react-three/drei";

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

function Modele({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
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
  return (
    <div className={className}>
      <Canvas camera={{ position: [0.35, 1.45, 2.3], fov: 52 }} dpr={[1, 2]}>
        <color attach="background" args={["#9db2f2"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} />
        <Suspense fallback={null}>
          {modeleUrl ? <Modele url={modeleUrl} /> : <PieceSchematique piece={piece} objet={objet} apres={apres} />}
        </Suspense>
        <OrbitControls
          target={[0, 0.25, -0.5]}
          enablePan={false}
          minDistance={1.2}
          maxDistance={5}
          maxPolarAngle={Math.PI / 2.05}
          autoRotate={tourner}
          autoRotateSpeed={1.5}
        />
      </Canvas>
    </div>
  );
}

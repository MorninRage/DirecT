import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { useRef } from "react";
import type { Group } from "three";

function SceneBody() {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.12;
      group.current.rotation.x += delta * 0.04;
    }
  });
  return (
    <group ref={group}>
      <mesh rotation={[0.4, 0.6, 0]} scale={2.4}>
        <torusKnotGeometry args={[1, 0.26, 96, 28]} />
        <meshStandardMaterial
          color="#1a2838"
          metalness={0.9}
          roughness={0.22}
          emissive="#081820"
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh rotation={[-0.35, -0.75, 0.2]} position={[-3.8, 1.2, -1.6]} scale={1.15}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#253445" metalness={0.92} roughness={0.14} emissive="#0a1420" emissiveIntensity={0.25} />
      </mesh>
      <mesh rotation={[0.5, 0.2, -0.4]} position={[3.2, -1.4, -2]} scale={[2.8, 0.08, 1.4]}>
        <boxGeometry />
        <meshStandardMaterial color="#1e2d3d" metalness={0.85} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[8, 10, 6]} intensity={1.15} color="#dcecff" />
      <directionalLight position={[-6, -4, 4]} intensity={0.35} color="#c9a961" />
      <pointLight position={[0, 3, 4]} intensity={0.6} color="#7ecbff" distance={20} />
    </>
  );
}

export function HudScene() {
  return (
    <div className="hud-scene-root" aria-hidden>
      <Canvas camera={{ position: [0, 0, 10], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <Lights />
        <SceneBody />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}

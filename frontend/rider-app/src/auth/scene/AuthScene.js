import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useFrame, useThree } from '@react-three/fiber';
import { sceneConfig } from './sceneConfig';

const c = sceneConfig.colors;

function Block({ position, scale, color, rotation }) {
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.16), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={position} scale={scale} rotation={rotation}><primitive object={geometry} attach="geometry" /><meshStandardMaterial color={color} roughness={0.8} /></mesh>;
}

function Wheel({ x }) {
  return <group position={[x, 0.48, 0]} rotation={[Math.PI / 2, 0, 0]}>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.3, 0.105, 10, 28]} /><meshStandardMaterial color={c.charcoal} roughness={0.9} /></mesh>
    <mesh><cylinderGeometry args={[0.215, 0.215, 0.18, 24]} /><meshStandardMaterial color={c.cream} roughness={0.8} /></mesh>
  </group>;
}

export default function AuthScene({ motionEnabled = true, mode }) {
  const scooter = useRef();
  const pin = useRef();
  const elapsed = useRef(0);
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    if (!size.width || !size.height) return;
    camera.zoom = Math.min(size.width / 5.2, size.height / 3.1);
    camera.lookAt(0, 0.65, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  useFrame((_, delta) => {
    if (!motionEnabled) return;
    elapsed.current += Math.min(delta, 0.05);
    scooter.current.rotation.y = Math.sin(elapsed.current * 0.65) * sceneConfig.yaw;
    scooter.current.position.y = Math.sin(elapsed.current * 0.8) * sceneConfig.bob;
    pin.current.position.y = 1.15 + Math.sin(elapsed.current * 1.2) * 0.045;
  });
  return <>
    <hemisphereLight args={['#fff8e9', '#9e9d8c', 2.4]} />
    <directionalLight position={[-3, 7, 5]} intensity={3} color="#fff4df" />
    <mesh position={[0, -0.04, 0]}><cylinderGeometry args={[1.95, 2, 0.12, 64]} /><meshStandardMaterial color={c.platform} roughness={1} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[1.5, 0.65, 1]}><circleGeometry args={[1, 40]} /><meshBasicMaterial color="#b6aa95" transparent opacity={0.2} depthWrite={false} /></mesh>
    <group ref={scooter}>
      <Wheel x={-0.87} /><Wheel x={0.92} />
      <Block position={[-0.67, 0.81, 0]} scale={[0.95, 0.57, 0.55]} color={c.clay} />
      <Block position={[0.15, 0.6, 0]} scale={[1.25, 0.12, 0.49]} color={c.clay} />
      <Block position={[0.75, 1, 0]} scale={[0.22, 0.85, 0.49]} rotation={[0, 0, -0.15]} color={c.clay} />
      <Block position={[0.9, 0.7, 0]} scale={[0.13, 0.5, 0.17]} rotation={[0, 0, 0.1]} color={c.sage} />
      <Block position={[-0.4, 1.24, 0]} scale={[0.82, 0.13, 0.6]} color={c.charcoal} />
      <Block position={[0.72, 1.57, 0]} scale={[0.14, 0.45, 0.13]} rotation={[0, 0, 0.25]} color={c.charcoal} />
      <Block position={[0.7, 1.78, 0]} scale={[0.15, 0.1, 0.85]} color={c.charcoal} />
      <mesh position={[0.83, 1.55, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.17, 0.19, 0.18, 24]} /><meshStandardMaterial color={c.cream} /></mesh>
      <Block position={[-1.05, 1.25, 0]} scale={[0.65, 0.08, 0.63]} color={c.sage} />
      {[1.42, 1.64, 1.86].map((y) => <mesh key={y} position={[-1.04, y, 0]}><cylinderGeometry args={[0.3, 0.3, 0.19, 24]} /><meshStandardMaterial color={c.cream} roughness={0.65} /></mesh>)}
      <Block position={[-1.04, 1.64, 0.3]} scale={[0.09, 0.65, 0.045]} color={c.sage} />
      <Block position={[-1.04, 1.98, 0]} scale={[0.36, 0.06, 0.1]} color={c.sage} />
    </group>
    <group ref={pin} position={[1.18, 1.15, -0.95]}>
      <mesh><sphereGeometry args={[0.22, 20, 14]} /><meshStandardMaterial color={mode === 'pending' ? c.sage : c.clay} /></mesh>
      <mesh position={[0, -0.23, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.17, 0.36, 20]} /><meshStandardMaterial color={c.clay} /></mesh>
    </group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.7, 0.035, -0.55]}><torusGeometry args={[0.72, 0.025, 6, 32, Math.PI * 1.4]} /><meshBasicMaterial color={c.sage} /></mesh>
  </>;
}

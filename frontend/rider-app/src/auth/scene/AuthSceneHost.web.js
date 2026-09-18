import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import AuthScene from './AuthScene';
import AuthSceneFallback from './AuthSceneFallback';
import SceneBoundary from './SceneBoundary';
import { sceneConfig } from './sceneConfig';

export default function AuthSceneHost({ motionEnabled, mode }) {
  const [lost, setLost] = useState(false);
  if (lost) return <AuthSceneFallback />;
  return (
    <SceneBoundary>
      <Canvas
        orthographic
        camera={sceneConfig.camera}
        dpr={[1, 1.5]}
        frameloop={motionEnabled ? 'always' : 'demand'}
        fallback={<AuthSceneFallback />}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', () => setLost(true), {
            once: true,
          });
        }}
      >
        <AuthScene
          motionEnabled={motionEnabled}
          mode={mode}
        />
      </Canvas>
    </SceneBoundary>
  );
}

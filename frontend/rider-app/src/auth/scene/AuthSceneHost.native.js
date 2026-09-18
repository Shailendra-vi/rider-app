import { Canvas } from '@react-three/fiber/native';
import AuthScene from './AuthScene';
import SceneBoundary from './SceneBoundary';
import { sceneConfig } from './sceneConfig';

export default function AuthSceneHost({ motionEnabled, mode }) {
  return (
    <SceneBoundary>
      <Canvas
        orthographic
        camera={sceneConfig.camera}
        dpr={1}
        frameloop={motionEnabled ? 'always' : 'demand'}
        gl={{ antialias: true, alpha: true }}
      >
        <AuthScene
          motionEnabled={motionEnabled}
          mode={mode}
        />
      </Canvas>
    </SceneBoundary>
  );
}

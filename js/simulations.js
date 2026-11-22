import { mountMotion } from './sim/motion.js';
import { mountProjectile } from './sim/projectile.js';
import { mountCircuit } from './sim/circuit.js';
import { mountOscillator } from './sim/oscillator.js';
import { mountCollision } from './sim/collision.js';
import { mountLens } from './sim/lens.js';
import { mountPhotoelectric } from './sim/photoelectric.js';

const SIMULATIONS = {
  motion: mountMotion,
  projectile: mountProjectile,
  circuit: mountCircuit,
  oscillator: mountOscillator,
  collision: mountCollision,
  lens: mountLens,
  photoelectric: mountPhotoelectric,
};

export function mountSimulation(id, container, api) {
  const mount = SIMULATIONS[id];
  if (!mount) {
    container.innerHTML = '<div class="empty-state"><p>实验模块暂不可用。</p></div>';
    return () => {};
  }
  return mount(container, api);
}

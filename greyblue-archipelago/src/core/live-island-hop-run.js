import {
  createIslandHopRunState,
  finishIslandHopRun,
  islandHopRunPublicState,
  startIslandHopRun,
  stepIslandHopRun,
} from './island-hop-run.js';

const COMPLETION_MESSAGE = 'Three islands in one flight.';

function finitePosition(position) {
  return position && [position.x, position.y, position.z].every(Number.isFinite);
}

function truthfulLandfall(detail) {
  return detail?.completed === true && typeof detail.islandId === 'string' && detail.islandId.trim().length > 0;
}

export class LiveIslandHopRun {
  constructor() {
    this.state = createIslandHopRunState();
    this.completionPublished = false;
  }

  reset() {
    this.state = createIslandHopRunState();
    this.completionPublished = false;
    return this.snapshot();
  }

  update({ frame, landfall = null } = {}) {
    let completionMessage = null;
    const position = frame?.position;

    if (truthfulLandfall(landfall) && finitePosition(position)) {
      if (!this.state.armed && !this.state.completed) {
        this.state = startIslandHopRun(this.state, landfall, position);
      } else if (this.state.armed && !this.state.completed) {
        this.state = finishIslandHopRun(this.state, landfall, position);
      }
    } else if (this.state.armed && !this.state.completed) {
      this.state = stepIslandHopRun({ state: this.state, frame });
    }

    if (this.state.completed && !this.completionPublished) {
      this.completionPublished = true;
      completionMessage = COMPLETION_MESSAGE;
    }

    return Object.freeze({
      ...this.snapshot(),
      completionMessage,
    });
  }

  snapshot() {
    return islandHopRunPublicState(this.state);
  }
}

export function createLiveIslandHopRun() {
  return new LiveIslandHopRun();
}

import type { Targetable } from 'tasks/types';
import { RoomPositionString } from 'utils/Collections';
import { TargetTask } from './TargetTask';

// The creep is pinned to the preferred position, so the movement range is 0 and the class range is unused.
export abstract class PreferredPositionTask<Target extends Targetable> extends TargetTask<Target> {
  public constructor(target: Target, preferredPosition: RoomPosition | RoomPositionString) {
    super(target, 0, preferredPosition);
  }
}

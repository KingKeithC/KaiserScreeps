import type { Targetable } from 'tasks/types';
import { RoomPositionString } from 'utils/Collections';
import { TargetTask } from './TargetTask';

// The creep is pinned to the preferred position, so the movement range is 0 and the class range is unused.
export abstract class PreferredPositionTask<Target extends Targetable> extends TargetTask<Target> {
  public constructor(target: Target | Id<Target>, preferredPosition: RoomPosition | RoomPositionString) {
    if (typeof target === 'string') super(target, 0, preferredPosition);
    else super(target, 0, preferredPosition);
  }
}

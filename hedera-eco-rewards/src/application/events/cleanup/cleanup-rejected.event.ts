/**
 * Cleanup Rejected Event
 * 
 * Domain event fired when a cleanup is rejected during verification.
 */

import { BaseDomainEvent } from '../base/event.interface';

export class CleanupRejectedEvent extends BaseDomainEvent {
  constructor(
    public readonly cleanupId: string,
    public readonly userId: string,
    public readonly rejectionReason: string,
    public readonly fraudIndicators: string[],
    requestingUserId?: string
  ) {
    super(
      'CleanupRejected',
      cleanupId,
      'Cleanup',
      requestingUserId,
      {
        userId,
        rejectionReason,
        fraudIndicators
      }
    );
  }
}
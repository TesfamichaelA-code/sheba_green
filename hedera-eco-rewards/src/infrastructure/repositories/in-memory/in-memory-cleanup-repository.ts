import { CleanupAggregate } from '../../../domain/aggregates/cleanup-aggregate';
import { 
  ICleanupRepository, 
  CleanupId, 
  VerificationStatus 
} from '../../../domain/repositories/cleanup-repository.interface';
import { UserId } from '../../../domain/repositories/user-repository.interface';

export class InMemoryCleanupRepository implements ICleanupRepository {
  private cleanups = new Map<CleanupId, CleanupAggregate>();

  async save(cleanup: CleanupAggregate): Promise<void> {
    this.cleanups.set(cleanup.getId(), cleanup);
  }

  async findById(id: CleanupId): Promise<CleanupAggregate | null> {
    return this.cleanups.get(id) || null;
  }

  async findByUserId(userId: UserId): Promise<CleanupAggregate[]> {
    return Array.from(this.cleanups.values()).filter(
      cleanup => cleanup.getUserId() === userId
    );
  }

  async findPendingVerification(): Promise<CleanupAggregate[]> {
    return Array.from(this.cleanups.values()).filter(
      cleanup => cleanup.getVerificationStatus() === VerificationStatus.PENDING
    );
  }

  async findByDateRange(start: Date, end: Date): Promise<CleanupAggregate[]> {
    return Array.from(this.cleanups.values()).filter(cleanup => {
      const timestamp = cleanup.getTimestamp();
      return timestamp >= start && timestamp <= end;
    });
  }

  async findByStatus(status: VerificationStatus): Promise<CleanupAggregate[]> {
    return Array.from(this.cleanups.values()).filter(
      cleanup => cleanup.getVerificationStatus() === status
    );
  }

  async findByLocation(
    latitude: number, 
    longitude: number, 
    radiusKm: number
  ): Promise<CleanupAggregate[]> {
    return Array.from(this.cleanups.values()).filter(cleanup => {
      const location = cleanup.getLocation();
      if (!location) return false;
      
      // Simple distance calculation (Haversine formula approximation)
      const distance = this.calculateDistance(
        latitude, longitude, 
        location.latitude, location.longitude
      );
      return distance <= radiusKm;
    });
  }

  async delete(id: CleanupId): Promise<void> {
    this.cleanups.delete(id);
  }

  async getCleanupCountByUser(userId: UserId): Promise<number> {
    return Array.from(this.cleanups.values()).filter(
      cleanup => cleanup.getUserId() === userId
    ).length;
  }

  // Helper method for distance calculation
  private calculateDistance(
    lat1: number, lon1: number, 
    lat2: number, lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Test helper methods
  clear(): void {
    this.cleanups.clear();
  }

  size(): number {
    return this.cleanups.size;
  }

  getAll(): CleanupAggregate[] {
    return Array.from(this.cleanups.values());
  }
}
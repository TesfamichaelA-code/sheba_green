/**
 * Cleanup Metrics Value Object
 * 
 * Represents the metrics and data associated with a cleanup activity.
 * Includes location, waste collected, area covered, and verification data.
 */

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number; // GPS accuracy in meters
}

export interface WasteData {
  plasticBottles: number;
  plasticBags: number;
  cans: number;
  organicWaste: number; // in kg
  otherWaste: number; // in kg
}

export class InvalidMetricsError extends Error {
  constructor(field: string, value: unknown) {
    super(`Invalid cleanup metrics - ${field}: ${value}`);
    this.name = 'InvalidMetricsError';
  }
}

export class CleanupMetrics {
  constructor(
    public readonly location: GeoLocation,
    public readonly wasteCollected: WasteData,
    public readonly areaCovered: number, // in square meters
    public readonly duration: number, // in minutes
    public readonly participantCount: number,
    public readonly imageHashes: string[], // IPFS hashes or similar
    public readonly timestamp: Date
  ) {
    this.validate();
  }

  private validate(): void {
    this.validateLocation();
    this.validateWasteData();
    this.validateAreaCovered();
    this.validateDuration();
    this.validateParticipantCount();
    this.validateImageHashes();
    this.validateTimestamp();
  }

  private validateLocation(): void {
    const { latitude, longitude, accuracy } = this.location;
    
    if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
      throw new InvalidMetricsError('latitude', latitude);
    }
    
    if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
      throw new InvalidMetricsError('longitude', longitude);
    }
    
    if (accuracy !== undefined && (typeof accuracy !== 'number' || accuracy < 0)) {
      throw new InvalidMetricsError('accuracy', accuracy);
    }
  }

  private validateWasteData(): void {
    const wasteFields = Object.entries(this.wasteCollected);
    
    for (const [field, value] of wasteFields) {
      if (typeof value !== 'number' || value < 0) {
        throw new InvalidMetricsError(`wasteCollected.${field}`, value);
      }
    }
  }

  private validateAreaCovered(): void {
    if (typeof this.areaCovered !== 'number' || this.areaCovered <= 0) {
      throw new InvalidMetricsError('areaCovered', this.areaCovered);
    }
  }

  private validateDuration(): void {
    if (typeof this.duration !== 'number' || this.duration <= 0) {
      throw new InvalidMetricsError('duration', this.duration);
    }
  }

  private validateParticipantCount(): void {
    if (typeof this.participantCount !== 'number' || this.participantCount <= 0 || !Number.isInteger(this.participantCount)) {
      throw new InvalidMetricsError('participantCount', this.participantCount);
    }
  }

  private validateImageHashes(): void {
    if (!Array.isArray(this.imageHashes)) {
      throw new InvalidMetricsError('imageHashes', this.imageHashes);
    }
    
    if (this.imageHashes.length === 0) {
      throw new InvalidMetricsError('imageHashes', 'At least one image hash is required');
    }
    
    for (const hash of this.imageHashes) {
      if (typeof hash !== 'string' || hash.trim().length === 0) {
        throw new InvalidMetricsError('imageHashes', hash);
      }
    }
  }

  private validateTimestamp(): void {
    if (!(this.timestamp instanceof Date) || isNaN(this.timestamp.getTime())) {
      throw new InvalidMetricsError('timestamp', this.timestamp);
    }
    
    // Ensure timestamp is not in the future (with 5 minute tolerance)
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (this.timestamp > fiveMinutesFromNow) {
      throw new InvalidMetricsError('timestamp', 'Timestamp cannot be in the future');
    }
  }

  getTotalWasteWeight(): number {
    const { plasticBottles, plasticBags, cans, organicWaste, otherWaste } = this.wasteCollected;
    
    // Estimated weights in kg
    const bottleWeight = 0.03; // 30g per bottle
    const bagWeight = 0.006; // 6g per bag
    const canWeight = 0.015; // 15g per can
    
    return (
      plasticBottles * bottleWeight +
      plasticBags * bagWeight +
      cans * canWeight +
      organicWaste +
      otherWaste
    );
  }

  getTotalWasteItems(): number {
    const { plasticBottles, plasticBags, cans } = this.wasteCollected;
    return plasticBottles + plasticBags + cans;
  }

  getEfficiencyScore(): number {
    // Calculate efficiency as waste collected per minute per participant
    const totalWeight = this.getTotalWasteWeight();
    return totalWeight / (this.duration * this.participantCount);
  }

  equals(other: CleanupMetrics): boolean {
    return (
      this.location.latitude === other.location.latitude &&
      this.location.longitude === other.location.longitude &&
      this.areaCovered === other.areaCovered &&
      this.duration === other.duration &&
      this.participantCount === other.participantCount &&
      this.timestamp.getTime() === other.timestamp.getTime() &&
      JSON.stringify(this.wasteCollected) === JSON.stringify(other.wasteCollected) &&
      JSON.stringify(this.imageHashes) === JSON.stringify(other.imageHashes)
    );
  }

  toJSON(): object {
    return {
      location: this.location,
      wasteCollected: this.wasteCollected,
      areaCovered: this.areaCovered,
      duration: this.duration,
      participantCount: this.participantCount,
      imageHashes: this.imageHashes,
      timestamp: this.timestamp.toISOString(),
      totalWasteWeight: this.getTotalWasteWeight(),
      totalWasteItems: this.getTotalWasteItems(),
      efficiencyScore: this.getEfficiencyScore()
    };
  }
}
/**
 * Unit tests for CleanupMetrics value object
 */

import { describe, it, expect } from 'vitest';
import { CleanupMetrics, InvalidMetricsError, GeoLocation, WasteData } from './cleanup-metrics';

describe('CleanupMetrics', () => {
  const validLocation: GeoLocation = {
    latitude: 9.0054,
    longitude: 38.7636,
    accuracy: 5
  };

  const validWasteData: WasteData = {
    plasticBottles: 10,
    plasticBags: 5,
    cans: 3,
    organicWaste: 2.5,
    otherWaste: 1.2
  };

  const validImageHashes = ['hash1', 'hash2', 'hash3'];
  const validTimestamp = new Date('2024-01-15T10:00:00Z');

  describe('constructor', () => {
    it('should create valid cleanup metrics', () => {
      const metrics = new CleanupMetrics(
        validLocation,
        validWasteData,
        100, // areaCovered
        60,  // duration
        3,   // participantCount
        validImageHashes,
        validTimestamp
      );

      expect(metrics.location).toEqual(validLocation);
      expect(metrics.wasteCollected).toEqual(validWasteData);
      expect(metrics.areaCovered).toBe(100);
      expect(metrics.duration).toBe(60);
      expect(metrics.participantCount).toBe(3);
      expect(metrics.imageHashes).toEqual(validImageHashes);
      expect(metrics.timestamp).toEqual(validTimestamp);
    });

    describe('location validation', () => {
      it('should throw error for invalid latitude', () => {
        const invalidLocation = { ...validLocation, latitude: 91 };
        expect(() => new CleanupMetrics(
          invalidLocation, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);

        const invalidLocation2 = { ...validLocation, latitude: -91 };
        expect(() => new CleanupMetrics(
          invalidLocation2, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);
      });

      it('should throw error for invalid longitude', () => {
        const invalidLocation = { ...validLocation, longitude: 181 };
        expect(() => new CleanupMetrics(
          invalidLocation, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);

        const invalidLocation2 = { ...validLocation, longitude: -181 };
        expect(() => new CleanupMetrics(
          invalidLocation2, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);
      });

      it('should throw error for invalid accuracy', () => {
        const invalidLocation = { ...validLocation, accuracy: -1 };
        expect(() => new CleanupMetrics(
          invalidLocation, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);
      });

      it('should accept valid boundary values', () => {
        const boundaryLocation1 = { latitude: 90, longitude: 180 };
        const boundaryLocation2 = { latitude: -90, longitude: -180 };
        
        expect(() => new CleanupMetrics(
          boundaryLocation1, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
        )).not.toThrow();

        expect(() => new CleanupMetrics(
          boundaryLocation2, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
        )).not.toThrow();
      });
    });

    describe('waste data validation', () => {
      it('should throw error for negative waste values', () => {
        const invalidWasteData = { ...validWasteData, plasticBottles: -1 };
        expect(() => new CleanupMetrics(
          validLocation, invalidWasteData, 100, 60, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);
      });

      it('should accept zero waste values', () => {
        const zeroWasteData = {
          plasticBottles: 0,
          plasticBags: 0,
          cans: 0,
          organicWaste: 0,
          otherWaste: 0
        };
        
        expect(() => new CleanupMetrics(
          validLocation, zeroWasteData, 100, 60, 3, validImageHashes, validTimestamp
        )).not.toThrow();
      });
    });

    describe('area covered validation', () => {
      it('should throw error for zero or negative area', () => {
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 0, 60, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);

        expect(() => new CleanupMetrics(
          validLocation, validWasteData, -10, 60, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);
      });
    });

    describe('duration validation', () => {
      it('should throw error for zero or negative duration', () => {
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 0, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);

        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, -30, 3, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);
      });
    });

    describe('participant count validation', () => {
      it('should throw error for zero or negative participant count', () => {
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 0, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);

        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, -1, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);
      });

      it('should throw error for non-integer participant count', () => {
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 2.5, validImageHashes, validTimestamp
        )).toThrow(InvalidMetricsError);
      });
    });

    describe('image hashes validation', () => {
      it('should throw error for empty image hashes array', () => {
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 3, [], validTimestamp
        )).toThrow(InvalidMetricsError);
      });

      it('should throw error for non-array image hashes', () => {
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 3, 'not-array' as any, validTimestamp
        )).toThrow(InvalidMetricsError);
      });

      it('should throw error for empty or invalid hash strings', () => {
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 3, [''], validTimestamp
        )).toThrow(InvalidMetricsError);

        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 3, ['  '], validTimestamp
        )).toThrow(InvalidMetricsError);

        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 3, [123 as any], validTimestamp
        )).toThrow(InvalidMetricsError);
      });
    });

    describe('timestamp validation', () => {
      it('should throw error for invalid date', () => {
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 3, validImageHashes, new Date('invalid')
        )).toThrow(InvalidMetricsError);
      });

      it('should throw error for future timestamp', () => {
        const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 3, validImageHashes, futureDate
        )).toThrow(InvalidMetricsError);
      });

      it('should accept timestamp within 5 minute tolerance', () => {
        const nearFutureDate = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes in future
        expect(() => new CleanupMetrics(
          validLocation, validWasteData, 100, 60, 3, validImageHashes, nearFutureDate
        )).not.toThrow();
      });
    });
  });

  describe('calculation methods', () => {
    let metrics: CleanupMetrics;

    beforeEach(() => {
      metrics = new CleanupMetrics(
        validLocation,
        validWasteData,
        100, // areaCovered
        60,  // duration
        3,   // participantCount
        validImageHashes,
        validTimestamp
      );
    });

    describe('getTotalWasteWeight', () => {
      it('should calculate total waste weight correctly', () => {
        const expectedWeight = 
          10 * 0.03 +  // plastic bottles
          5 * 0.006 +  // plastic bags
          3 * 0.015 +  // cans
          2.5 +        // organic waste
          1.2;         // other waste

        expect(metrics.getTotalWasteWeight()).toBeCloseTo(expectedWeight, 3);
      });
    });

    describe('getTotalWasteItems', () => {
      it('should calculate total waste items correctly', () => {
        const expectedItems = 10 + 5 + 3; // bottles + bags + cans
        expect(metrics.getTotalWasteItems()).toBe(expectedItems);
      });
    });

    describe('getEfficiencyScore', () => {
      it('should calculate efficiency score correctly', () => {
        const totalWeight = metrics.getTotalWasteWeight();
        const expectedScore = totalWeight / (60 * 3); // weight / (duration * participants)
        expect(metrics.getEfficiencyScore()).toBeCloseTo(expectedScore, 6);
      });
    });
  });

  describe('equals', () => {
    it('should return true for identical metrics', () => {
      const metrics1 = new CleanupMetrics(
        validLocation, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
      );
      const metrics2 = new CleanupMetrics(
        validLocation, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
      );

      expect(metrics1.equals(metrics2)).toBe(true);
    });

    it('should return false for different metrics', () => {
      const metrics1 = new CleanupMetrics(
        validLocation, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
      );
      const metrics2 = new CleanupMetrics(
        validLocation, validWasteData, 200, 60, 3, validImageHashes, validTimestamp
      );

      expect(metrics1.equals(metrics2)).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should return comprehensive JSON representation', () => {
      const metrics = new CleanupMetrics(
        validLocation, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
      );

      const json = metrics.toJSON();

      expect(json).toHaveProperty('location', validLocation);
      expect(json).toHaveProperty('wasteCollected', validWasteData);
      expect(json).toHaveProperty('areaCovered', 100);
      expect(json).toHaveProperty('duration', 60);
      expect(json).toHaveProperty('participantCount', 3);
      expect(json).toHaveProperty('imageHashes', validImageHashes);
      expect(json).toHaveProperty('timestamp', validTimestamp.toISOString());
      expect(json).toHaveProperty('totalWasteWeight');
      expect(json).toHaveProperty('totalWasteItems');
      expect(json).toHaveProperty('efficiencyScore');
    });
  });

  describe('immutability', () => {
    it('should be immutable - properties cannot be modified', () => {
      const metrics = new CleanupMetrics(
        validLocation, validWasteData, 100, 60, 3, validImageHashes, validTimestamp
      );

      // Attempting to modify should not affect the original
      const location = metrics.location;
      location.latitude = 999;
      expect(metrics.location.latitude).toBe(validLocation.latitude);

      const wasteData = metrics.wasteCollected;
      wasteData.plasticBottles = 999;
      expect(metrics.wasteCollected.plasticBottles).toBe(validWasteData.plasticBottles);
    });
  });
});
/**
 * Domain Aggregates Index
 * 
 * Exports all domain aggregates for easy importing
 */

export { UserAggregate, UserAggregateError } from './user-aggregate';
export { 
  CleanupAggregate, 
  CleanupAggregateError,
  RewardCalculationContext,
  FraudDetectionContext 
} from './cleanup-aggregate';
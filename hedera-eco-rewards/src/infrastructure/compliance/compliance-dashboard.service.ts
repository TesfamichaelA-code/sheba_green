import { Injectable } from '../container/injectable.decorator';
import { ILogger } from '../monitoring/logger.interface';
import { AuditAggregatorService, AuditQuery } from './audit-aggregator.service';
import { GDPRComplianceService } from './gdpr-compliance.service';
import { DataRetentionService } from './data-retention.service';

export interface ComplianceDashboard {
  overview: ComplianceOverview;
  gdprMetrics: GDPRMetrics;
  auditMetrics: AuditMetrics;
  dataRetentionMetrics: DataRetentionMetrics;
  securityMetrics: SecurityMetrics;
  alerts: ComplianceAlert[];
  recommendations: ComplianceRecommendation[];
}

export interface ComplianceOverview {
  overallScore: number; // 0-100
  lastUpdated: Date;
  complianceStatus: 'compliant' | 'warning' | 'non-compliant';
  totalUsers: number;
  activeUsers: number;
  dataProcessingActivities: number;
  auditEvents: number;
}

export interface GDPRMetrics {
  dataSubjectRequests: {
    total: number;
    pending: number;
    completed: number;
    overdue: number;
  };
  consentManagement: {
    totalConsents: number;
    activeConsents: number;
    withdrawnConsents: number;
    consentRate: number;
  };
  dataBreaches: {
    total: number;
    reportedWithin72Hours: number;
    resolved: number;
  };
  rightToBeForgettenRequests: {
    total: number;
    processed: number;
    pending: number;
  };
}

export interface AuditMetrics {
  totalEvents: number;
  eventsLast24Hours: number;
  eventsLast7Days: number;
  eventsLast30Days: number;
  eventTypes: Record<string, number>;
  integrityScore: number;
  completenessScore: number;
}

export interface DataRetentionMetrics {
  totalRecords: number;
  recordsNearingExpiry: number;
  expiredRecords: number;
  retentionPolicies: number;
  complianceRate: number;
}

export interface SecurityMetrics {
  securityEvents: number;
  failedLogins: number;
  suspiciousActivities: number;
  encryptionCompliance: number;
  accessControlViolations: number;
}

export interface ComplianceAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  title: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  actionRequired: string;
}

export interface ComplianceRecommendation {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  estimatedEffort: string;
  potentialImpact: string;
}

@Injectable()
export class ComplianceDashboardService {
  constructor(
    private readonly auditAggregator: AuditAggregatorService,
    private readonly gdprService: GDPRComplianceService,
    private readonly dataRetentionService: DataRetentionService,
    private readonly logger: ILogger
  ) {}

  /**
   * Get complete compliance dashboard
   */
  async getDashboard(): Promise<ComplianceDashboard> {
    try {
      const [
        overview,
        gdprMetrics,
        auditMetrics,
        dataRetentionMetrics,
        securityMetrics,
        alerts,
        recommendations
      ] = await Promise.all([
        this.getComplianceOverview(),
        this.getGDPRMetrics(),
        this.getAuditMetrics(),
        this.getDataRetentionMetrics(),
        this.getSecurityMetrics(),
        this.getComplianceAlerts(),
        this.getComplianceRecommendations()
      ]);

      return {
        overview,
        gdprMetrics,
        auditMetrics,
        dataRetentionMetrics,
        securityMetrics,
        alerts,
        recommendations
      };
    } catch (error) {
      this.logger.error('Failed to generate compliance dashboard', { error });
      throw error;
    }
  }

  /**
   * Get compliance overview
   */
  async getComplianceOverview(): Promise<ComplianceOverview> {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const auditEvents = await this.auditAggregator.queryEvents({
        startDate: last30Days,
        endDate: now
      });

      const userEvents = auditEvents.filter(e => e.eventType === 'user_created');
      const activeUserEvents = auditEvents.filter(e => 
        e.userId && e.timestamp > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      );

      const complianceScore = await this.calculateOverallComplianceScore();
      const complianceStatus = this.getComplianceStatus(complianceScore);

      return {
        overallScore: complianceScore,
        lastUpdated: now,
        complianceStatus,
        totalUsers: new Set(auditEvents.filter(e => e.userId).map(e => e.userId)).size,
        activeUsers: new Set(activeUserEvents.map(e => e.userId)).size,
        dataProcessingActivities: auditEvents.filter(e => 
          e.action.includes('create') || 
          e.action.includes('update') || 
          e.action.includes('process')
        ).length,
        auditEvents: auditEvents.length
      };
    } catch (error) {
      this.logger.error('Failed to get compliance overview', { error });
      throw error;
    }
  }

  /**
   * Get GDPR metrics
   */
  async getGDPRMetrics(): Promise<GDPRMetrics> {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const gdprEvents = await this.auditAggregator.queryEvents({
        startDate: last30Days,
        endDate: now,
        eventTypes: ['gdpr_access_request', 'gdpr_rectification', 'gdpr_erasure', 'gdpr_portability']
      });

      const consentEvents = await this.auditAggregator.queryEvents({
        startDate: last30Days,
        endDate: now,
        eventTypes: ['consent_recorded', 'consent_withdrawn']
      });

      const dataBreachEvents = await this.auditAggregator.queryEvents({
        startDate: last30Days,
        endDate: now,
        eventTypes: ['data_breach_detected', 'data_breach_reported', 'data_breach_resolved']
      });

      return {
        dataSubjectRequests: {
          total: gdprEvents.length,
          pending: gdprEvents.filter(e => !e.details?.completed).length,
          completed: gdprEvents.filter(e => e.details?.completed).length,
          overdue: gdprEvents.filter(e => this.isOverdue(e.timestamp, 30)).length
        },
        consentManagement: {
          totalConsents: consentEvents.length,
          activeConsents: consentEvents.filter(e => 
            e.eventType === 'consent_recorded' && e.details?.granted
          ).length,
          withdrawnConsents: consentEvents.filter(e => 
            e.eventType === 'consent_withdrawn'
          ).length,
          consentRate: this.calculateConsentRate(consentEvents)
        },
        dataBreaches: {
          total: dataBreachEvents.filter(e => e.eventType === 'data_breach_detected').length,
          reportedWithin72Hours: dataBreachEvents.filter(e => 
            e.eventType === 'data_breach_reported' && 
            this.isReportedWithin72Hours(e.timestamp, e.details?.detectionTime)
          ).length,
          resolved: dataBreachEvents.filter(e => e.eventType === 'data_breach_resolved').length
        },
        rightToBeForgettenRequests: {
          total: gdprEvents.filter(e => e.eventType === 'gdpr_erasure').length,
          processed: gdprEvents.filter(e => 
            e.eventType === 'gdpr_erasure' && e.details?.completed
          ).length,
          pending: gdprEvents.filter(e => 
            e.eventType === 'gdpr_erasure' && !e.details?.completed
          ).length
        }
      };
    } catch (error) {
      this.logger.error('Failed to get GDPR metrics', { error });
      throw error;
    }
  }

  /**
   * Get audit metrics
   */
  async getAuditMetrics(): Promise<AuditMetrics> {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        allEvents,
        events24h,
        events7d,
        events30d
      ] = await Promise.all([
        this.auditAggregator.queryEvents({ limit: 10000 }),
        this.auditAggregator.queryEvents({ startDate: last24Hours }),
        this.auditAggregator.queryEvents({ startDate: last7Days }),
        this.auditAggregator.queryEvents({ startDate: last30Days })
      ]);

      const eventTypes: Record<string, number> = {};
      events30d.forEach(event => {
        eventTypes[event.eventType] = (eventTypes[event.eventType] || 0) + 1;
      });

      return {
        totalEvents: allEvents.length,
        eventsLast24Hours: events24h.length,
        eventsLast7Days: events7d.length,
        eventsLast30Days: events30d.length,
        eventTypes,
        integrityScore: this.calculateIntegrityScore(events30d),
        completenessScore: this.calculateCompletenessScore(events30d)
      };
    } catch (error) {
      this.logger.error('Failed to get audit metrics', { error });
      throw error;
    }
  }

  /**
   * Get data retention metrics
   */
  async getDataRetentionMetrics(): Promise<DataRetentionMetrics> {
    try {
      const retentionStatus = await this.dataRetentionService.getRetentionStatus();
      
      return {
        totalRecords: retentionStatus.totalRecords,
        recordsNearingExpiry: retentionStatus.recordsNearingExpiry,
        expiredRecords: retentionStatus.expiredRecords,
        retentionPolicies: retentionStatus.activePolicies,
        complianceRate: retentionStatus.complianceRate
      };
    } catch (error) {
      this.logger.error('Failed to get data retention metrics', { error });
      throw error;
    }
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics(): Promise<SecurityMetrics> {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const securityEvents = await this.auditAggregator.queryEvents({
        startDate: last30Days,
        endDate: now,
        eventTypes: ['security_event', 'failed_login', 'suspicious_activity', 'access_violation']
      });

      return {
        securityEvents: securityEvents.length,
        failedLogins: securityEvents.filter(e => e.eventType === 'failed_login').length,
        suspiciousActivities: securityEvents.filter(e => e.eventType === 'suspicious_activity').length,
        encryptionCompliance: await this.calculateEncryptionCompliance(),
        accessControlViolations: securityEvents.filter(e => e.eventType === 'access_violation').length
      };
    } catch (error) {
      this.logger.error('Failed to get security metrics', { error });
      throw error;
    }
  }

  /**
   * Get compliance alerts
   */
  async getComplianceAlerts(): Promise<ComplianceAlert[]> {
    try {
      const alerts: ComplianceAlert[] = [];

      // Check for overdue GDPR requests
      const overdueGDPR = await this.checkOverdueGDPRRequests();
      alerts.push(...overdueGDPR);

      // Check for data retention violations
      const retentionViolations = await this.checkDataRetentionViolations();
      alerts.push(...retentionViolations);

      // Check for security incidents
      const securityIncidents = await this.checkSecurityIncidents();
      alerts.push(...securityIncidents);

      // Check for audit gaps
      const auditGaps = await this.checkAuditGaps();
      alerts.push(...auditGaps);

      return alerts.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });
    } catch (error) {
      this.logger.error('Failed to get compliance alerts', { error });
      throw error;
    }
  }

  /**
   * Get compliance recommendations
   */
  async getComplianceRecommendations(): Promise<ComplianceRecommendation[]> {
    try {
      const recommendations: ComplianceRecommendation[] = [];

      // Analyze current compliance state and generate recommendations
      const complianceScore = await this.calculateOverallComplianceScore();
      
      if (complianceScore < 90) {
        recommendations.push({
          id: 'improve-audit-coverage',
          category: 'Audit',
          title: 'Improve Audit Coverage',
          description: 'Increase audit event coverage to capture more system activities',
          priority: 'high',
          estimatedEffort: '2-3 weeks',
          potentialImpact: 'Improved compliance score and better visibility'
        });
      }

      // Add more recommendations based on metrics
      const gdprMetrics = await this.getGDPRMetrics();
      if (gdprMetrics.dataSubjectRequests.overdue > 0) {
        recommendations.push({
          id: 'reduce-gdpr-response-time',
          category: 'GDPR',
          title: 'Reduce GDPR Response Time',
          description: 'Implement automated workflows to handle GDPR requests faster',
          priority: 'high',
          estimatedEffort: '1-2 weeks',
          potentialImpact: 'Reduced legal risk and improved user satisfaction'
        });
      }

      return recommendations;
    } catch (error) {
      this.logger.error('Failed to get compliance recommendations', { error });
      throw error;
    }
  }

  private async calculateOverallComplianceScore(): Promise<number> {
    try {
      // Calculate weighted compliance score based on different factors
      const weights = {
        gdpr: 0.3,
        audit: 0.25,
        security: 0.25,
        dataRetention: 0.2
      };

      const gdprScore = await this.calculateGDPRScore();
      const auditScore = await this.calculateAuditScore();
      const securityScore = await this.calculateSecurityScore();
      const dataRetentionScore = await this.calculateDataRetentionScore();

      const overallScore = 
        gdprScore * weights.gdpr +
        auditScore * weights.audit +
        securityScore * weights.security +
        dataRetentionScore * weights.dataRetention;

      return Math.round(overallScore);
    } catch (error) {
      this.logger.error('Failed to calculate overall compliance score', { error });
      return 0;
    }
  }

  private getComplianceStatus(score: number): 'compliant' | 'warning' | 'non-compliant' {
    if (score >= 90) return 'compliant';
    if (score >= 70) return 'warning';
    return 'non-compliant';
  }

  private isOverdue(timestamp: Date, days: number): boolean {
    const deadline = new Date(timestamp.getTime() + days * 24 * 60 * 60 * 1000);
    return new Date() > deadline;
  }

  private calculateConsentRate(consentEvents: any[]): number {
    const granted = consentEvents.filter(e => 
      e.eventType === 'consent_recorded' && e.details?.granted
    ).length;
    const total = consentEvents.filter(e => e.eventType === 'consent_recorded').length;
    return total > 0 ? (granted / total) * 100 : 0;
  }

  private isReportedWithin72Hours(reportTime: Date, detectionTime: Date): boolean {
    const timeDiff = reportTime.getTime() - detectionTime.getTime();
    return timeDiff <= 72 * 60 * 60 * 1000; // 72 hours in milliseconds
  }

  private calculateIntegrityScore(events: any[]): number {
    // Calculate based on event completeness and consistency
    const completeEvents = events.filter(e => 
      e.id && e.timestamp && e.eventType && e.action
    ).length;
    return events.length > 0 ? (completeEvents / events.length) * 100 : 100;
  }

  private calculateCompletenessScore(events: any[]): number {
    // Calculate based on expected vs actual events
    // This is a simplified calculation
    return 95; // Placeholder
  }

  private async calculateEncryptionCompliance(): Promise<number> {
    // Check encryption compliance across the system
    return 98; // Placeholder
  }

  private async checkOverdueGDPRRequests(): Promise<ComplianceAlert[]> {
    // Implementation for checking overdue GDPR requests
    return [];
  }

  private async checkDataRetentionViolations(): Promise<ComplianceAlert[]> {
    // Implementation for checking data retention violations
    return [];
  }

  private async checkSecurityIncidents(): Promise<ComplianceAlert[]> {
    // Implementation for checking security incidents
    return [];
  }

  private async checkAuditGaps(): Promise<ComplianceAlert[]> {
    // Implementation for checking audit gaps
    return [];
  }

  private async calculateGDPRScore(): Promise<number> {
    const metrics = await this.getGDPRMetrics();
    // Calculate GDPR compliance score based on metrics
    let score = 100;
    
    if (metrics.dataSubjectRequests.overdue > 0) {
      score -= metrics.dataSubjectRequests.overdue * 10;
    }
    
    if (metrics.consentManagement.consentRate < 80) {
      score -= 20;
    }
    
    return Math.max(0, score);
  }

  private async calculateAuditScore(): Promise<number> {
    const metrics = await this.getAuditMetrics();
    return (metrics.integrityScore + metrics.completenessScore) / 2;
  }

  private async calculateSecurityScore(): Promise<number> {
    const metrics = await this.getSecurityMetrics();
    let score = 100;
    
    if (metrics.accessControlViolations > 0) {
      score -= metrics.accessControlViolations * 5;
    }
    
    score = Math.min(score, metrics.encryptionCompliance);
    
    return Math.max(0, score);
  }

  private async calculateDataRetentionScore(): Promise<number> {
    const metrics = await this.getDataRetentionMetrics();
    return metrics.complianceRate;
  }
}
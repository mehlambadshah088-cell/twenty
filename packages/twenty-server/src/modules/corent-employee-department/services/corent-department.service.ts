import { Injectable, Logger } from '@nestjs/common';
import {
  CorentDepartment,
  DepartmentConfig,
  INITIAL_DEPARTMENTS,
} from '../types/corent-department.types';

@Injectable()
export class CorentDepartmentService {
  private readonly logger = new Logger(CorentDepartmentService.name);
  private readonly departments = new Map<string, DepartmentConfig>();

  constructor() {
    this.initDefaultDepartments();
  }

  private initDefaultDepartments() {
    Object.values(INITIAL_DEPARTMENTS).forEach((dept) => {
      this.departments.set(dept.code.toUpperCase(), dept);
    });
    this.logger.log(`Initialized default departments: ${Array.from(this.departments.keys()).join(', ')}`);
  }

  /**
   * Returns all active departments
   */
  public getDepartments(): DepartmentConfig[] {
    return Array.from(this.departments.values()).filter((d) => d.isActive);
  }

  /**
   * Retrieve a department config by code
   */
  public getDepartment(code: string): DepartmentConfig | undefined {
    if (!code) return undefined;
    return this.departments.get(code.toUpperCase());
  }

  /**
   * Extensible: register or upgrade a department dynamically without schema refactoring
   */
  public registerDepartment(config: DepartmentConfig): DepartmentConfig {
    const code = config.code.toUpperCase();
    const existing = this.departments.get(code);

    const merged: DepartmentConfig = {
      ...(existing || {}),
      ...config,
      code,
    };

    this.departments.set(code, merged);
    this.logger.log(`Registered/updated department: ${code} (${merged.name})`);
    return merged;
  }

  /**
   * Check if a department is valid and currently active
   */
  public isValidDepartment(code: string): boolean {
    if (!code) return false;
    const dept = this.departments.get(code.toUpperCase());
    return Boolean(dept && dept.isActive);
  }

  /**
   * Configurable rule-based department resolver for incoming leads
   * Maps lead category, business niche, or tags to the correct department.
   * Defaults to MARKETING (operational primary) or OTHER.
   */
  public resolveDepartment(category?: string | null): string {
    if (!category) return CorentDepartment.MARKETING;
    const normalized = category.trim().toUpperCase();

    // Direct code or name match
    if (this.departments.has(normalized)) {
      return normalized;
    }

    for (const [code, dept] of this.departments.entries()) {
      if (dept.name.toUpperCase() === normalized) {
        return code;
      }
    }

    // Heuristics for Marketing category keywords
    const marketingKeywords = [
      'MARKET',
      'CAMPAIGN',
      'OUTREACH',
      'LEAD',
      'PROMOTION',
      'INBOUND',
      'SOCIAL',
      'SEO',
      'AD',
      'WEBSITE',
      'DIGITAL',
    ];

    if (marketingKeywords.some((keyword) => normalized.includes(keyword))) {
      return CorentDepartment.MARKETING;
    }

    // Heuristics for Other
    return CorentDepartment.OTHER;
  }
}

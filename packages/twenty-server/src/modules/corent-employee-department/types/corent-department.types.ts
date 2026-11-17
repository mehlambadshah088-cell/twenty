export enum CorentDepartment {
  MARKETING = 'MARKETING',
  OTHER = 'OTHER',
}

export interface DepartmentConfig {
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  routingWeight?: number;
  metadata?: Record<string, unknown>;
}

export const INITIAL_DEPARTMENTS: Record<CorentDepartment, DepartmentConfig> = {
  [CorentDepartment.MARKETING]: {
    code: CorentDepartment.MARKETING,
    name: 'Marketing',
    description: 'Primary operational department for marketing leads and campaigns',
    isActive: true,
    routingWeight: 100,
  },
  [CorentDepartment.OTHER]: {
    code: CorentDepartment.OTHER,
    name: 'Other',
    description: 'Secondary and general department leads',
    isActive: true,
    routingWeight: 10,
  },
};

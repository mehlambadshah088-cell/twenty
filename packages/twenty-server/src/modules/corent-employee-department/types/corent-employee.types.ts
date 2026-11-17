export enum CorentEmployeeRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  AGENT = 'AGENT',
  INTERN = 'INTERN',
}

export enum CorentEmployeeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface CorentEmployee {
  employeeId: string;             // Unique internal code e.g. COR-MKT-001
  workspaceMemberId: string;      // Linked to Twenty's WorkspaceMember
  userId: string;                 // Linked to Twenty's User
  name: string;
  email: string;
  department: string;             // 'MARKETING', 'OTHER', or dynamically registered department
  role: CorentEmployeeRole;
  status: CorentEmployeeStatus;
  callixPortalUserId?: number | null; // Direct Callix employee account mapping anchor
  callixLoginId?: string | null;      // Direct Callix login identity (e.g. "mkt_intern_1")
  canReceiveLeads: boolean;           // Round-robin eligibility flag
  activeLeadsCount: number;           // Capacity metric
  createdAt: Date;
  updatedAt: Date;
}

export interface MapCallixAccountDto {
  workspaceMemberId: string;
  callixPortalUserId: number;
  callixLoginId: string;
}

export interface UpdateEmployeeDepartmentDto {
  workspaceMemberId: string;
  department: string;
  canReceiveLeads?: boolean;
  status?: CorentEmployeeStatus;
}

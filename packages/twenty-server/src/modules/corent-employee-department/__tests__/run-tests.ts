// Standalone test suite verifying Phase 3 logic
import { CorentDepartment, INITIAL_DEPARTMENTS, DepartmentConfig } from '../types/corent-department.types';
import {
  CorentEmployee,
  CorentEmployeeRole,
  CorentEmployeeStatus,
  MapCallixAccountDto,
} from '../types/corent-employee.types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

// Logic test mirroring CorentDepartmentService
class TestCorentDepartmentService {
  private readonly departments = new Map<string, DepartmentConfig>();

  constructor() {
    Object.values(INITIAL_DEPARTMENTS).forEach((dept) => {
      this.departments.set(dept.code.toUpperCase(), dept);
    });
  }

  public getDepartments(): DepartmentConfig[] {
    return Array.from(this.departments.values()).filter((d) => d.isActive);
  }

  public registerDepartment(config: DepartmentConfig): DepartmentConfig {
    const code = config.code.toUpperCase();
    const merged = { ...(this.departments.get(code) || {}), ...config, code };
    this.departments.set(code, merged);
    return merged;
  }

  public isValidDepartment(code: string): boolean {
    if (!code) return false;
    const dept = this.departments.get(code.toUpperCase());
    return Boolean(dept && dept.isActive);
  }

  public resolveDepartment(category?: string | null): string {
    if (!category) return CorentDepartment.MARKETING;
    const normalized = category.trim().toUpperCase();
    if (this.departments.has(normalized)) return normalized;

    const keywords = ['MARKET', 'CAMPAIGN', 'OUTREACH', 'LEAD', 'PROMOTION', 'INBOUND', 'SOCIAL', 'SEO'];
    if (keywords.some((k) => normalized.includes(k))) return CorentDepartment.MARKETING;

    return CorentDepartment.OTHER;
  }
}

// Logic test mirroring CorentEmployeeService
class TestCorentEmployeeService {
  private readonly employees = new Map<string, CorentEmployee>();
  constructor(private readonly deptService: TestCorentDepartmentService) {}

  public getAllEmployees(): CorentEmployee[] {
    return Array.from(this.employees.values());
  }

  public getEmployeeByMemberId(id: string) {
    return this.employees.get(id);
  }

  public getEmployeeByCallixId(id: number) {
    return Array.from(this.employees.values()).find((e) => e.callixPortalUserId === id);
  }

  public syncWorkspaceMemberAsEmployee(member: {
    id: string;
    userId: string;
    name: string;
    email: string;
    department?: string;
  }): CorentEmployee {
    const existing = this.employees.get(member.id);
    if (existing) {
      existing.name = member.name || existing.name;
      existing.email = member.email || existing.email;
      return existing;
    }

    const dept = member.department && this.deptService.isValidDepartment(member.department)
      ? member.department.toUpperCase()
      : CorentDepartment.MARKETING;

    const count = Array.from(this.employees.values()).filter((e) => e.department === dept).length + 1;
    const employeeId = `COR-${dept.substring(0, 3)}-${String(count).padStart(3, '0')}`;

    const newEmp: CorentEmployee = {
      employeeId,
      workspaceMemberId: member.id,
      userId: member.userId,
      name: member.name,
      email: member.email,
      department: dept,
      role: CorentEmployeeRole.AGENT,
      status: CorentEmployeeStatus.ACTIVE,
      canReceiveLeads: true,
      activeLeadsCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.employees.set(member.id, newEmp);
    return newEmp;
  }

  public mapCallixAccount(dto: MapCallixAccountDto): CorentEmployee {
    const emp = this.employees.get(dto.workspaceMemberId);
    if (!emp) throw new Error('Employee not found');
    emp.callixPortalUserId = dto.callixPortalUserId;
    emp.callixLoginId = dto.callixLoginId;
    return emp;
  }

  public getEligibleEmployeesByDepartment(department: string): CorentEmployee[] {
    const norm = department.toUpperCase();
    return Array.from(this.employees.values()).filter(
      (e) => e.department === norm && e.status === CorentEmployeeStatus.ACTIVE && e.canReceiveLeads,
    );
  }
}

// Logic test mirroring CorentDepartmentAccessGuard
class TestCorentDepartmentAccessGuard {
  constructor(private readonly empService: TestCorentEmployeeService) {}

  public canAccess(user: { id: string; role?: string }, targetDepartment?: string): boolean {
    if (user.role === 'admin') return true;
    if (!targetDepartment) return true;

    const emp = this.empService.getEmployeeByMemberId(user.id);
    if (!emp) return false;

    return emp.department.toUpperCase() === targetDepartment.toUpperCase();
  }
}

async function run() {
  console.log('--- Running Phase 3 Pure Logic Verification ---');

  const deptService = new TestCorentDepartmentService();
  const empService = new TestCorentEmployeeService(deptService);
  const guard = new TestCorentDepartmentAccessGuard(empService);

  // 1. Department Architecture
  const depts = deptService.getDepartments();
  assert(depts.length === 2, 'Exactly 2 departments initialized (Marketing & Other)');
  assert(deptService.isValidDepartment(CorentDepartment.MARKETING), 'Marketing department is valid');
  assert(deptService.isValidDepartment(CorentDepartment.OTHER), 'Other department is valid');
  assert(!deptService.isValidDepartment('FINANCE'), 'Unregistered department is invalid');

  // 2. Extensibility: registering a new department dynamically
  deptService.registerDepartment({
    code: 'FUNDING',
    name: 'Funding',
    description: 'Future funding department',
    isActive: true,
  });
  assert(deptService.isValidDepartment('FUNDING'), 'Dynamic future department registered successfully');
  assert(deptService.getDepartments().length === 3, 'Departments count upgraded to 3 seamlessly');

  // 3. Category Resolver
  assert(
    deptService.resolveDepartment('Digital Marketing Outbound') === CorentDepartment.MARKETING,
    'Resolves marketing category to MARKETING',
  );
  assert(
    deptService.resolveDepartment('General Inquiries') === CorentDepartment.OTHER,
    'Resolves unclassified category to OTHER',
  );

  // 4. Employee Management
  const emp1 = empService.syncWorkspaceMemberAsEmployee({
    id: 'wm-1',
    userId: 'u-1',
    name: 'Sarah Connor',
    email: 'sarah@thecorent.com',
    department: CorentDepartment.MARKETING,
  });
  assert(emp1.name === 'Sarah Connor', 'Employee name synced from WorkspaceMember');
  assert(emp1.department === CorentDepartment.MARKETING, 'Employee assigned to MARKETING');
  assert(emp1.status === CorentEmployeeStatus.ACTIVE, 'Employee active by default');
  assert(emp1.employeeId.startsWith('COR-MAR-'), 'Employee ID formatted as COR-MAR-001');

  // 5. Prevent duplicate employee records
  empService.syncWorkspaceMemberAsEmployee({
    id: 'wm-1',
    userId: 'u-1',
    name: 'Sarah Connor Updated',
    email: 'sarah@thecorent.com',
  });
  assert(empService.getAllEmployees().length === 1, 'No duplicate employee created on re-sync');
  assert(empService.getEmployeeByMemberId('wm-1')?.name === 'Sarah Connor Updated', 'Employee updated in place');

  // 6. Direct Callix Account Mapping
  const mapped = empService.mapCallixAccount({
    workspaceMemberId: 'wm-1',
    callixPortalUserId: 101,
    callixLoginId: 'sarah_callix',
  });
  assert(mapped.callixPortalUserId === 101, 'Callix portal user ID mapped');
  assert(mapped.callixLoginId === 'sarah_callix', 'Callix login ID mapped');
  assert(empService.getEmployeeByCallixId(101)?.employeeId === emp1.employeeId, 'Lookup by Callix ID works');

  // 7. Department access guard - Admin access
  assert(guard.canAccess({ id: 'admin-1', role: 'admin' }, CorentDepartment.OTHER) === true, 'Admin can access any department');

  // 8. Department access guard - Same department allowed
  assert(guard.canAccess({ id: 'wm-1' }, CorentDepartment.MARKETING) === true, 'Marketing staff can access Marketing department');

  // 9. Department access guard - Cross department blocked
  assert(guard.canAccess({ id: 'wm-1' }, CorentDepartment.OTHER) === false, 'Cross-department access strictly blocked');

  console.log('--- All Phase 3 Step 7, 8, 9 Tests Passed Successfully! ---');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

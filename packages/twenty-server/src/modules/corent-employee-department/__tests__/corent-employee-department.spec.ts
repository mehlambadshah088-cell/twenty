import { CorentDepartmentService } from '../services/corent-department.service';
import { CorentEmployeeService } from '../services/corent-employee.service';
import { CorentDepartmentAccessGuard } from '../guards/corent-department-access.guard';
import { CorentDepartment } from '../types/corent-department.types';
import { CorentEmployeeRole, CorentEmployeeStatus } from '../types/corent-employee.types';
import { ForbiddenException } from '@nestjs/common';

describe('Phase 3: Corent Employee & Department Management', () => {
  let departmentService: CorentDepartmentService;
  let employeeService: CorentEmployeeService;
  let guard: CorentDepartmentAccessGuard;

  beforeEach(() => {
    departmentService = new CorentDepartmentService();
    employeeService = new CorentEmployeeService(departmentService);
    guard = new CorentDepartmentAccessGuard(employeeService);
  });

  describe('Step 8: Department Architecture', () => {
    it('initializes with the 2 specified departments: MARKETING and OTHER', () => {
      const depts = departmentService.getDepartments();
      expect(depts.length).toBe(2);
      expect(depts.map((d) => d.code)).toEqual(
        expect.arrayContaining([CorentDepartment.MARKETING, CorentDepartment.OTHER]),
      );
    });

    it('validates active departments correctly', () => {
      expect(departmentService.isValidDepartment('MARKETING')).toBe(true);
      expect(departmentService.isValidDepartment('marketing')).toBe(true);
      expect(departmentService.isValidDepartment('OTHER')).toBe(true);
      expect(departmentService.isValidDepartment('NON_EXISTENT')).toBe(false);
    });

    it('easily registers or upgrades new departments in the future without code changes', () => {
      departmentService.registerDepartment({
        code: 'FUNDING',
        name: 'Funding',
        description: 'Business funding and investments',
        isActive: true,
        routingWeight: 50,
      });

      expect(departmentService.isValidDepartment('FUNDING')).toBe(true);
      expect(departmentService.getDepartments().length).toBe(3);
    });

    it('intelligently resolves department based on category keywords', () => {
      expect(departmentService.resolveDepartment('Digital Marketing Campaign')).toBe(CorentDepartment.MARKETING);
      expect(departmentService.resolveDepartment('Inbound Lead Generation')).toBe(CorentDepartment.MARKETING);
      expect(departmentService.resolveDepartment('General Inquiries')).toBe(CorentDepartment.OTHER);
      expect(departmentService.resolveDepartment(null)).toBe(CorentDepartment.MARKETING);
    });
  });

  describe('Step 7: Employee Management', () => {
    it('registers an employee from workspace member with unique ID and department', () => {
      const employee = employeeService.syncWorkspaceMemberAsEmployee({
        id: 'member-1',
        userId: 'user-1',
        name: 'John Marketer',
        email: 'john@thecorent.com',
        department: CorentDepartment.MARKETING,
      });

      expect(employee.employeeId).toMatch(/^COR-MAR-\d{3}$/);
      expect(employee.name).toBe('John Marketer');
      expect(employee.department).toBe(CorentDepartment.MARKETING);
      expect(employee.status).toBe(CorentEmployeeStatus.ACTIVE);
      expect(employee.canReceiveLeads).toBe(true);
    });

    it('prevents duplicate employee records when re-syncing', () => {
      employeeService.syncWorkspaceMemberAsEmployee({
        id: 'member-1',
        userId: 'user-1',
        name: 'John Marketer',
        email: 'john@thecorent.com',
        department: CorentDepartment.MARKETING,
      });

      const updated = employeeService.syncWorkspaceMemberAsEmployee({
        id: 'member-1',
        userId: 'user-1',
        name: 'John Marketer Updated',
        email: 'john@thecorent.com',
      });

      expect(employeeService.getAllEmployees().length).toBe(1);
      expect(updated.name).toBe('John Marketer Updated');
    });

    it('maps Callix employee account stably', () => {
      employeeService.syncWorkspaceMemberAsEmployee({
        id: 'member-1',
        userId: 'user-1',
        name: 'John Marketer',
        email: 'john@thecorent.com',
        department: CorentDepartment.MARKETING,
      });

      const mapped = employeeService.mapCallixAccount({
        workspaceMemberId: 'member-1',
        callixPortalUserId: 42,
        callixLoginId: 'john_mkt',
      });

      expect(mapped.callixPortalUserId).toBe(42);
      expect(mapped.callixLoginId).toBe('john_mkt');

      const byCallixId = employeeService.getEmployeeByCallixId(42);
      expect(byCallixId?.name).toBe('John Marketer');
    });

    it('filters eligible employees by department for round-robin assignment', () => {
      employeeService.syncWorkspaceMemberAsEmployee({
        id: 'm1',
        userId: 'u1',
        name: 'Active Mkt 1',
        email: 'm1@thecorent.com',
        department: CorentDepartment.MARKETING,
      });

      employeeService.syncWorkspaceMemberAsEmployee({
        id: 'm2',
        userId: 'u2',
        name: 'Inactive Mkt 2',
        email: 'm2@thecorent.com',
        department: CorentDepartment.MARKETING,
      });
      employeeService.updateEmployeeDepartment({
        workspaceMemberId: 'm2',
        department: CorentDepartment.MARKETING,
        status: CorentEmployeeStatus.INACTIVE,
      });

      employeeService.syncWorkspaceMemberAsEmployee({
        id: 'o1',
        userId: 'u3',
        name: 'Active Other 1',
        email: 'o1@thecorent.com',
        department: CorentDepartment.OTHER,
      });

      const eligibleMarketing = employeeService.getEligibleEmployeesByDepartment(CorentDepartment.MARKETING);
      expect(eligibleMarketing.length).toBe(1);
      expect(eligibleMarketing[0].name).toBe('Active Mkt 1');

      const eligibleOther = employeeService.getEligibleEmployeesByDepartment(CorentDepartment.OTHER);
      expect(eligibleOther.length).toBe(1);
      expect(eligibleOther[0].name).toBe('Active Other 1');
    });
  });

  describe('Step 9: Department-based Permissions Guard', () => {
    it('allows administrators full access across all departments', () => {
      employeeService.syncWorkspaceMemberAsEmployee({
        id: 'admin-1',
        userId: 'user-admin',
        name: 'Admin Boss',
        email: 'admin@thecorent.com',
        jobTitle: 'Admin',
      });

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { workspaceMemberId: 'admin-1', id: 'admin-1', role: 'admin' },
            params: { department: CorentDepartment.OTHER },
          }),
        }),
      } as any;

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('allows Marketing employee access to Marketing department', () => {
      employeeService.syncWorkspaceMemberAsEmployee({
        id: 'mkt-1',
        userId: 'u-mkt',
        name: 'Mkt Agent',
        email: 'mkt@thecorent.com',
        department: CorentDepartment.MARKETING,
      });

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { workspaceMemberId: 'mkt-1', id: 'mkt-1' },
            params: { department: CorentDepartment.MARKETING },
          }),
        }),
      } as any;

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('blocks cross-department access for non-admin employees', () => {
      employeeService.syncWorkspaceMemberAsEmployee({
        id: 'mkt-1',
        userId: 'u-mkt',
        name: 'Mkt Agent',
        email: 'mkt@thecorent.com',
        department: CorentDepartment.MARKETING,
      });

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { workspaceMemberId: 'mkt-1', id: 'mkt-1' },
            params: { department: CorentDepartment.OTHER },
          }),
        }),
      } as any;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });
  });
});

import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { CorentDepartmentService } from './corent-department.service';
import {
  CorentEmployee,
  CorentEmployeeRole,
  CorentEmployeeStatus,
  MapCallixAccountDto,
  UpdateEmployeeDepartmentDto,
} from '../types/corent-employee.types';
import { CorentDepartment } from '../types/corent-department.types';

@Injectable()
export class CorentEmployeeService {
  private readonly logger = new Logger(CorentEmployeeService.name);

  // In-memory persistent employee index mapping workspaceMemberId -> CorentEmployee
  // In production, backed by TypeORM/Twenty-ORM metadata repository
  private readonly employees = new Map<string, CorentEmployee>();

  constructor(private readonly departmentService: CorentDepartmentService) {}

  /**
   * Get all registered Corent employees
   */
  public getAllEmployees(): CorentEmployee[] {
    return Array.from(this.employees.values());
  }

  /**
   * Get employee by workspaceMemberId
   */
  public getEmployeeByMemberId(workspaceMemberId: string): CorentEmployee | undefined {
    return this.employees.get(workspaceMemberId);
  }

  /**
   * Get employee by direct Callix Portal User ID
   */
  public getEmployeeByCallixId(callixPortalUserId: number): CorentEmployee | undefined {
    return Array.from(this.employees.values()).find(
      (emp) => emp.callixPortalUserId === callixPortalUserId,
    );
  }

  /**
   * Get employee by direct Callix Login ID
   */
  public getEmployeeByCallixLoginId(callixLoginId: string): CorentEmployee | undefined {
    return Array.from(this.employees.values()).find(
      (emp) => emp.callixLoginId?.toLowerCase() === callixLoginId.toLowerCase(),
    );
  }

  /**
   * Register or sync an employee from an existing Twenty WorkspaceMember
   * Strictly avoids duplicate employee creation.
   */
  public syncWorkspaceMemberAsEmployee(member: {
    id: string;
    userId: string;
    name: string;
    email: string;
    jobTitle?: string | null;
    department?: string;
  }): CorentEmployee {
    const existing = this.employees.get(member.id);
    if (existing) {
      // Update existing record
      existing.name = member.name || existing.name;
      existing.email = member.email || existing.email;
      if (member.department && this.departmentService.isValidDepartment(member.department)) {
        existing.department = member.department.toUpperCase();
      }
      existing.updatedAt = new Date();
      return existing;
    }

    // Determine initial department
    const department = member.department && this.departmentService.isValidDepartment(member.department)
      ? member.department.toUpperCase()
      : CorentDepartment.MARKETING;

    // Generate readable employee ID e.g. COR-MKT-001
    const prefix = department.substring(0, 3);
    const count = Array.from(this.employees.values()).filter((e) => e.department === department).length + 1;
    const employeeId = `COR-${prefix}-${String(count).padStart(3, '0')}`;

    const newEmployee: CorentEmployee = {
      employeeId,
      workspaceMemberId: member.id,
      userId: member.userId,
      name: member.name,
      email: member.email,
      department,
      role: member.jobTitle?.toLowerCase().includes('admin')
        ? CorentEmployeeRole.ADMIN
        : member.jobTitle?.toLowerCase().includes('manager')
        ? CorentEmployeeRole.MANAGER
        : CorentEmployeeRole.AGENT,
      status: CorentEmployeeStatus.ACTIVE,
      canReceiveLeads: true,
      activeLeadsCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.employees.set(member.id, newEmployee);
    this.logger.log(`Registered employee ${newEmployee.employeeId} (${newEmployee.name}) in ${newEmployee.department}`);
    return newEmployee;
  }

  /**
   * Map employee to direct Callix identity
   */
  public mapCallixAccount(dto: MapCallixAccountDto): CorentEmployee {
    const employee = this.employees.get(dto.workspaceMemberId);
    if (!employee) {
      throw new NotFoundException(`Employee with workspaceMemberId ${dto.workspaceMemberId} not found`);
    }

    // Check if another employee already has this Callix ID
    const duplicate = Array.from(this.employees.values()).find(
      (e) => e.workspaceMemberId !== dto.workspaceMemberId && e.callixPortalUserId === dto.callixPortalUserId,
    );
    if (duplicate) {
      throw new ConflictException(
        `Callix user ID ${dto.callixPortalUserId} is already mapped to employee ${duplicate.employeeId} (${duplicate.name})`,
      );
    }

    employee.callixPortalUserId = dto.callixPortalUserId;
    employee.callixLoginId = dto.callixLoginId;
    employee.updatedAt = new Date();

    this.logger.log(`Mapped employee ${employee.employeeId} to Callix user ID ${dto.callixPortalUserId}`);
    return employee;
  }

  /**
   * Update department or active status for an employee
   */
  public updateEmployeeDepartment(dto: UpdateEmployeeDepartmentDto): CorentEmployee {
    const employee = this.employees.get(dto.workspaceMemberId);
    if (!employee) {
      throw new NotFoundException(`Employee with workspaceMemberId ${dto.workspaceMemberId} not found`);
    }

    if (!this.departmentService.isValidDepartment(dto.department)) {
      throw new NotFoundException(`Department ${dto.department} is not a valid or active department`);
    }

    employee.department = dto.department.toUpperCase();
    if (dto.canReceiveLeads !== undefined) {
      employee.canReceiveLeads = dto.canReceiveLeads;
    }
    if (dto.status !== undefined) {
      employee.status = dto.status;
    }
    employee.updatedAt = new Date();

    this.logger.log(`Updated employee ${employee.employeeId} department to ${employee.department}`);
    return employee;
  }

  /**
   * Fetch eligible employees for a department to receive new leads
   * Must be ACTIVE and canReceiveLeads === true
   */
  public getEligibleEmployeesByDepartment(department: string): CorentEmployee[] {
    const normalized = department.toUpperCase();
    return Array.from(this.employees.values()).filter(
      (emp) =>
        emp.department === normalized &&
        emp.status === CorentEmployeeStatus.ACTIVE &&
        emp.canReceiveLeads,
    );
  }

  /**
   * Increment lead count when assigned
   */
  public incrementLeadCount(workspaceMemberId: string): void {
    const employee = this.employees.get(workspaceMemberId);
    if (employee) {
      employee.activeLeadsCount += 1;
      employee.updatedAt = new Date();
    }
  }

  /**
   * Decrement lead count when reassigned or closed
   */
  public decrementLeadCount(workspaceMemberId: string): void {
    const employee = this.employees.get(workspaceMemberId);
    if (employee && employee.activeLeadsCount > 0) {
      employee.activeLeadsCount -= 1;
      employee.updatedAt = new Date();
    }
  }
}

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { CorentEmployeeService } from '../services/corent-employee.service';
import { CorentEmployeeRole } from '../types/corent-employee.types';

@Injectable()
export class CorentDepartmentAccessGuard implements CanActivate {
  constructor(private readonly employeeService: CorentEmployeeService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no authenticated user, let downstream AuthGuards handle 401
    if (!user) {
      return true;
    }

    const workspaceMemberId = user.workspaceMemberId || user.id;
    const employee = this.employeeService.getEmployeeByMemberId(workspaceMemberId);

    // If employee is an Administrator or manager, grant full access across all departments
    if (employee?.role === CorentEmployeeRole.ADMIN || user.role === 'admin') {
      return true;
    }

    // Determine target department from request params, query, or body
    const targetDepartment =
      request.params?.department ||
      request.query?.department ||
      request.body?.department;

    if (!targetDepartment) {
      // If no department specified on the route, allow
      return true;
    }

    if (!employee) {
      throw new ForbiddenException(
        'Access denied: You are not registered as an authorized employee in this CRM.',
      );
    }

    const employeeDept = employee.department.toUpperCase();
    const requestedDept = String(targetDepartment).toUpperCase();

    // Check if employee's department matches requested department
    if (employeeDept !== requestedDept) {
      throw new ForbiddenException(
        `Cross-department access blocked: Your department (${employee.department}) is not authorized to access ${requestedDept} records.`,
      );
    }

    return true;
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CorentDepartmentService } from '../services/corent-department.service';
import { CorentEmployeeService } from '../services/corent-employee.service';
import { CorentDepartmentAccessGuard } from '../guards/corent-department-access.guard';
import {
  DepartmentConfig,
} from '../types/corent-department.types';
import {
  MapCallixAccountDto,
  UpdateEmployeeDepartmentDto,
} from '../types/corent-employee.types';

@Controller('api/corent')
export class CorentEmployeeDepartmentController {
  constructor(
    private readonly departmentService: CorentDepartmentService,
    private readonly employeeService: CorentEmployeeService,
  ) {}

  @Get('departments')
  getDepartments() {
    return {
      success: true,
      departments: this.departmentService.getDepartments(),
    };
  }

  @Post('departments')
  @HttpCode(HttpStatus.CREATED)
  registerDepartment(@Body() config: DepartmentConfig) {
    const created = this.departmentService.registerDepartment(config);
    return {
      success: true,
      department: created,
    };
  }

  @Get('employees')
  getEmployees() {
    return {
      success: true,
      employees: this.employeeService.getAllEmployees(),
    };
  }

  @Get('employees/department/:department')
  @UseGuards(CorentDepartmentAccessGuard)
  getEmployeesByDepartment(@Param('department') department: string) {
    return {
      success: true,
      department: department.toUpperCase(),
      employees: this.employeeService.getEligibleEmployeesByDepartment(department),
    };
  }

  @Post('employees/map-callix')
  @HttpCode(HttpStatus.OK)
  mapCallixAccount(@Body() dto: MapCallixAccountDto) {
    const updated = this.employeeService.mapCallixAccount(dto);
    return {
      success: true,
      employee: updated,
    };
  }

  @Post('employees/department')
  @HttpCode(HttpStatus.OK)
  updateEmployeeDepartment(@Body() dto: UpdateEmployeeDepartmentDto) {
    const updated = this.employeeService.updateEmployeeDepartment(dto);
    return {
      success: true,
      employee: updated,
    };
  }
}

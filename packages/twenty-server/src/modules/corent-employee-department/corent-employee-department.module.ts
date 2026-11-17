import { Module } from '@nestjs/common';
import { CorentDepartmentService } from './services/corent-department.service';
import { CorentEmployeeService } from './services/corent-employee.service';
import { CorentDepartmentAccessGuard } from './guards/corent-department-access.guard';
import { CorentEmployeeDepartmentController } from './controllers/corent-employee-department.controller';

@Module({
  controllers: [CorentEmployeeDepartmentController],
  providers: [
    CorentDepartmentService,
    CorentEmployeeService,
    CorentDepartmentAccessGuard,
  ],
  exports: [
    CorentDepartmentService,
    CorentEmployeeService,
    CorentDepartmentAccessGuard,
  ],
})
export class CorentEmployeeDepartmentModule {}

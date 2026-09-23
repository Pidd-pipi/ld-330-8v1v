import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreatePrescriptionDto, PrescriptionsService, UpdatePrescriptionStatusDto } from './prescriptions.service';

@Controller()
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get('records/:id/prescriptions')
  listByRecord(@Param('id') id: string) {
    return this.prescriptionsService.listByRecord(Number(id));
  }

  @Post('records/:id/prescriptions')
  create(@Param('id') id: string, @Body() body: CreatePrescriptionDto) {
    return this.prescriptionsService.create(Number(id), body);
  }

  @Patch('prescriptions/:id/status')
  updateStatus(@Param('id') id: string, @Body() body: UpdatePrescriptionStatusDto) {
    return this.prescriptionsService.updateStatus(Number(id), body);
  }
}

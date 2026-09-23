import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreatePatientDto,
  CreatePrescriptionDto,
  RecordsService,
  UpdatePrescriptionStatusDto,
} from './records.service';

@Controller()
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get('summary')
  summary() {
    return this.recordsService.summary();
  }

  @Get('patients')
  patients(@Query('keyword') keyword?: string) {
    return this.recordsService.searchPatients(keyword);
  }

  @Post('patients')
  createPatient(@Body() body: CreatePatientDto) {
    return this.recordsService.createPatient(body);
  }

  @Get('patients/:id/timeline')
  timeline(@Param('id') id: string) {
    return this.recordsService.timeline(Number(id));
  }

  @Post('patients/:id/records')
  createRecord(@Param('id') id: string) {
    return this.recordsService.createRecord(Number(id));
  }

  @Get('records/:id/prescriptions')
  prescriptions(@Param('id') id: string) {
    return this.recordsService.listPrescriptions(Number(id));
  }

  @Post('records/:id/prescriptions')
  createPrescription(@Param('id') id: string, @Body() body: CreatePrescriptionDto) {
    return this.recordsService.createPrescription(Number(id), body);
  }

  @Patch('prescriptions/:id/status')
  updatePrescriptionStatus(@Param('id') id: string, @Body() body: UpdatePrescriptionStatusDto) {
    return this.recordsService.updatePrescriptionStatus(Number(id), body);
  }
}

import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VerifiedFacilityGuard } from '../../common/guards/verified-facility.guard';
import { Public } from '../../common/decorators/public.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { MaterialsService } from './materials.service';
import { CreateOutputDto, UpdateOutputDto, CreateInputDto, UpdateInputDto, ListQueryDto } from './materials.dto';

@UseGuards(JwtAuthGuard)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Audit('create', 'output')
  @Idempotent()
  @Throttle({ default: { limit: 100, ttl: 60 * 60 * 1000 } }) // docs/04: 100/saat, kullanıcı
  @UseGuards(VerifiedFacilityGuard)
  @Post('outputs')
  createOutput(@GetUser() user: { sub: string }, @Body() dto: CreateOutputDto) {
    return this.materialsService.createOutput(user.sub, dto);
  }

  @Get('outputs')
  listOutputs(@GetUser() user: { sub: string }, @Query() query: ListQueryDto) {
    return this.materialsService.listOutputs(user.sub, query);
  }

  @Get('outputs/:id')
  getOutput(@GetUser() user: { sub: string }, @Param('id') id: string) {
    return this.materialsService.getOutput(user.sub, id);
  }

  @Audit('update', 'output')
  @Patch('outputs/:id')
  updateOutput(@GetUser() user: { sub: string }, @Param('id') id: string, @Body() dto: UpdateOutputDto) {
    return this.materialsService.updateOutput(user.sub, id, dto);
  }

  @Audit('delete', 'output')
  @Delete('outputs/:id')
  deleteOutput(@GetUser() user: { sub: string }, @Param('id') id: string) {
    return this.materialsService.deleteOutput(user.sub, id);
  }

  @Audit('create', 'input')
  @Idempotent()
  @UseGuards(VerifiedFacilityGuard)
  @Post('inputs')
  createInput(@GetUser() user: { sub: string }, @Body() dto: CreateInputDto) {
    return this.materialsService.createInput(user.sub, dto);
  }

  @Get('inputs')
  listInputs(@GetUser() user: { sub: string }, @Query() query: ListQueryDto) {
    return this.materialsService.listInputs(user.sub, query);
  }

  @Audit('update', 'input')
  @Patch('inputs/:id')
  updateInput(@GetUser() user: { sub: string }, @Param('id') id: string, @Body() dto: UpdateInputDto) {
    return this.materialsService.updateInput(user.sub, id, dto);
  }

  @Audit('delete', 'input')
  @Delete('inputs/:id')
  deleteInput(@GetUser() user: { sub: string }, @Param('id') id: string) {
    return this.materialsService.deleteInput(user.sub, id);
  }

  @Public()
  @Throttle({ default: { limit: 100, ttl: 60 * 1000 } }) // docs/04: public (DPP), 100/dk, IP
  @Get('passport/:id/json')
  getPassportJson(@Param('id') id: string, @Query('sig') sig?: string) {
    return this.materialsService.getPassportJson(id, sig);
  }

  @Public()
  @Throttle({ default: { limit: 100, ttl: 60 * 1000 } })
  @Get('passport/:id/pdf')
  async getPassportPdf(@Param('id') id: string, @Query('sig') sig: string | undefined, @Res() reply: FastifyReply) {
    const buffer = await this.materialsService.getPassportPdf(id, sig);
    reply.type('application/pdf').send(buffer);
  }

  @Get('passport/:id/qr')
  async getPassportQr(@GetUser() user: { sub: string }, @Param('id') id: string, @Res() reply: FastifyReply) {
    const buffer = await this.materialsService.getPassportQrPng(user.sub, id);
    reply.type('image/png').send(buffer);
  }
}

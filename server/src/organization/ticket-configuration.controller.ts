import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { UserRole as PrismaRole } from '../../generated/prisma/client';
import { CreateNameDto } from './dto/create-name.dto';
import { TicketConfigurationService } from './ticket-configuration.service';
type Request = {
  user: { sub: number; role: PrismaRole; sessionVersion: number };
};
const actor = (req: Request) => ({
  id: req.user.sub,
  role: req.user.role,
  sessionVersion: req.user.sessionVersion,
});
@Controller('ticket-configuration')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class TicketConfigurationController {
  constructor(private readonly service: TicketConfigurationService) {}
  @Get('categories') listcategories() {
    return this.service.list('categories');
  }
  @Post('categories') createcategories(
    @Req() req: Request,
    @Body() dto: CreateNameDto,
  ) {
    return this.service.write('categories', null, dto, actor(req));
  }
  @Patch('categories/:id') renamecategories(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateNameDto,
  ) {
    return this.service.write('categories', id, dto, actor(req));
  }
  @Post('categories/:id/archive') archivecategories(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.write('categories', id, { archived: true }, actor(req));
  }
  @Post('categories/:id/reactivate') reactivatecategories(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.write(
      'categories',
      id,
      { archived: false },
      actor(req),
    );
  }
  @Get('tags') listtags() {
    return this.service.list('tags');
  }
  @Post('tags') createtags(@Req() req: Request, @Body() dto: CreateNameDto) {
    return this.service.write('tags', null, dto, actor(req));
  }
  @Patch('tags/:id') renametags(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateNameDto,
  ) {
    return this.service.write('tags', id, dto, actor(req));
  }
  @Post('tags/:id/archive') archivetags(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.write('tags', id, { archived: true }, actor(req));
  }
  @Post('tags/:id/reactivate') reactivatetags(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.write('tags', id, { archived: false }, actor(req));
  }
}

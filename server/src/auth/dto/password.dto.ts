import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Password } from '../password';

export class ResetPasswordDto {
  @Password()
  newPassword!: string;
}

export class ChangePasswordDto extends ResetPasswordDto {
  @Password(1)
  currentPassword!: string;
}

export class AccountEmailDto {
  @IsEmail() @MaxLength(255) email!: string;
}
export class ConsumeActionDto extends ResetPasswordDto {
  @IsString() @MaxLength(128) token!: string;
}

export class EmptyAccountActionDto {}

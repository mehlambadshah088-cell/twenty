import { Field, InputType, ObjectType } from '@nestjs/graphql';

import {
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';

@InputType()
export class CrmLeadCalendarAvailabilityInput {
  @IsUUID()
  @Field(() => String)
  ownerWorkspaceMemberId: string;

  @IsDateString()
  @Field(() => String)
  startsAt: string;

  @IsDateString()
  @Field(() => String)
  endsAt: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  timeZone?: string;
}

@ObjectType()
export class CrmLeadCalendarBusyInterval {
  @Field(() => String)
  start: string;

  @Field(() => String)
  end: string;
}

@ObjectType()
export class CrmLeadCalendarAvailability {
  @Field(() => Boolean)
  available: boolean;

  @Field(() => String)
  timeZone: string;

  @Field(() => [CrmLeadCalendarBusyInterval])
  busyIntervals: CrmLeadCalendarBusyInterval[];
}

@InputType()
export class BookCrmLeadMeetingInput {
  @IsUUID()
  @Field(() => String)
  ownerWorkspaceMemberId: string;

  @IsUUID()
  @Field(() => String)
  employeeWorkspaceMemberId: string;

  @IsUUID()
  @Field(() => String)
  leadRecordId: string;

  @IsDateString()
  @Field(() => String)
  startsAt: string;

  @IsDateString()
  @Field(() => String)
  endsAt: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  timeZone?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  description?: string;

  @IsOptional()
  @IsString()
  @Field(() => String, { nullable: true })
  location?: string;
}

@ObjectType()
export class BookCrmLeadMeetingOutput {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => String)
  message: string;

  @Field(() => String, { nullable: true })
  calendarEventId?: string;

  @Field(() => String, { nullable: true })
  conferenceLink?: string;

  @Field(() => [CrmLeadCalendarBusyInterval])
  busyIntervals: CrmLeadCalendarBusyInterval[];
}

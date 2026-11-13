import { useLazyQuery, useMutation } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import gql from 'graphql-tag';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { type WorkspaceMember } from '@/workspace-member/types/WorkspaceMember';
import { Badge } from 'twenty-ui/primitives/data-display';
import { Button, Field, Input, Select } from 'twenty-ui/primitives/input';
import { Dialog } from 'twenty-ui/primitives/surfaces';
import { Text } from 'twenty-ui/primitives/typography';
import { IconCalendarClock, IconVideo } from 'twenty-ui/icon';

type BusyInterval = {
  start: string;
  end: string;
};

type AvailabilityData = {
  crmLeadCalendarAvailability: {
    available: boolean;
    timeZone: string;
    busyIntervals: BusyInterval[];
  };
};

type AvailabilityVariables = {
  input: {
    ownerWorkspaceMemberId: string;
    startsAt: string;
    endsAt: string;
    timeZone: string;
  };
};

type BookingData = {
  bookCrmLeadMeeting: {
    success: boolean;
    message: string;
    calendarEventId?: string | null;
    conferenceLink?: string | null;
    busyIntervals: BusyInterval[];
  };
};

type BookingVariables = {
  input: {
    ownerWorkspaceMemberId: string;
    employeeWorkspaceMemberId: string;
    leadRecordId: string;
    startsAt: string;
    endsAt: string;
    timeZone: string;
    description?: string;
  };
};

const CRM_LEAD_CALENDAR_AVAILABILITY = gql(
  'query CrmLeadCalendarAvailability($input: CrmLeadCalendarAvailabilityInput!) { crmLeadCalendarAvailability(input: $input) { available timeZone busyIntervals { start end } } }',
);

const BOOK_CRM_LEAD_MEETING = gql(
  'mutation BookCrmLeadMeeting($input: BookCrmLeadMeetingInput!) { bookCrmLeadMeeting(input: $input) { success message calendarEventId conferenceLink busyIntervals { start end } } }',
);

const formatLocalDateTime = (date: Date): string => {
  const offsetMilliseconds = date.getTimezoneOffset() * 60 * 1000;

  return new Date(date.getTime() - offsetMilliseconds)
    .toISOString()
    .slice(0, 16);
};

const toIsoDateTime = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Enter a valid meeting date and time.');
  }

  return date.toISOString();
};

const formatBusyTime = (value: string, timeZone: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));

const getMemberLabel = (member: WorkspaceMember): string => {
  const fullName =
    [member.name.firstName, member.name.lastName].filter(Boolean).join(' ') ||
    member.userEmail;

  return fullName + ' · ' + member.userEmail;
};

export const ScheduleLeadMeetingButton = ({
  leadRecordId,
}: {
  leadRecordId: string;
}) => {
  const apolloCoreClient = useApolloCoreClient();
  const currentWorkspaceMember = useAtomStateValue(
    currentWorkspaceMemberState,
  );
  const { records: workspaceMembers, loading: loadingMembers } =
    useFindManyRecords<WorkspaceMember>({
      objectNameSingular: 'workspaceMember',
      limit: 100,
    });

  const [open, setOpen] = useState(false);
  const [ownerWorkspaceMemberId, setOwnerWorkspaceMemberId] = useState('');
  const [employeeWorkspaceMemberId, setEmployeeWorkspaceMemberId] =
    useState('');
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    formatLocalDateTime(new Date(Date.now() + 30 * 60 * 1000)),
  );
  const [endsAtLocal, setEndsAtLocal] = useState(() =>
    formatLocalDateTime(new Date(Date.now() + 90 * 60 * 1000)),
  );
  const [description, setDescription] = useState('');
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [bookingMessage, setBookingMessage] = useState<{
    success: boolean;
    message: string;
    conferenceLink?: string | null;
  } | null>(null);

  const ownerOptions = useMemo(
    () =>
      workspaceMembers
        .filter((member) => Boolean(member.userEmail))
        .map((member) => ({
          value: member.id,
          label: getMemberLabel(member),
        })),
    [workspaceMembers],
  );

  const selectedOwner = workspaceMembers.find(
    (member) => member.id === ownerWorkspaceMemberId,
  );
  const timeZone =
    selectedOwner?.timeZone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'UTC';

  const [
    checkAvailability,
    {
      data: availabilityData,
      loading: checkingAvailability,
      error: availabilityError,
    },
  ] = useLazyQuery<AvailabilityData, AvailabilityVariables>(
    CRM_LEAD_CALENDAR_AVAILABILITY,
    {
      client: apolloCoreClient,
      fetchPolicy: 'network-only',
    },
  );

  const [bookMeeting, { loading: booking }] = useMutation<
    BookingData,
    BookingVariables
  >(BOOK_CRM_LEAD_MEETING, {
    client: apolloCoreClient,
  });

  const availability = availabilityData?.crmLeadCalendarAvailability;

  const resetCheck = () => {
    setAvailabilityChecked(false);
    setBookingMessage(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen) {
      if (!ownerWorkspaceMemberId && workspaceMembers.length > 0) {
        setOwnerWorkspaceMemberId(workspaceMembers[0].id);
      }

      if (currentWorkspaceMember?.id && !employeeWorkspaceMemberId) {
        setEmployeeWorkspaceMemberId(currentWorkspaceMember.id);
      }
    } else {
      setAvailabilityChecked(false);
      setBookingMessage(null);
    }
  };

  const handleCheckAvailability = async () => {
    if (!ownerWorkspaceMemberId || !startsAtLocal || !endsAtLocal) {
      setBookingMessage({
        success: false,
        message: 'Choose a meeting owner, start time, and end time first.',
      });

      return;
    }

    try {
      const response = await checkAvailability({
        variables: {
          input: {
            ownerWorkspaceMemberId,
            startsAt: toIsoDateTime(startsAtLocal),
            endsAt: toIsoDateTime(endsAtLocal),
            timeZone,
          },
        },
      });

      setAvailabilityChecked(
        Boolean(response.data?.crmLeadCalendarAvailability),
      );
      setBookingMessage(null);
    } catch (error) {
      setAvailabilityChecked(false);
      setBookingMessage({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Could not check the owner calendar.',
      });
    }
  };

  const handleBookMeeting = async () => {
    if (
      !ownerWorkspaceMemberId ||
      !employeeWorkspaceMemberId ||
      !availability?.available
    ) {
      return;
    }

    try {
      const response = await bookMeeting({
        variables: {
          input: {
            ownerWorkspaceMemberId,
            employeeWorkspaceMemberId,
            leadRecordId,
            startsAt: toIsoDateTime(startsAtLocal),
            endsAt: toIsoDateTime(endsAtLocal),
            timeZone,
            description: description.trim() || undefined,
          },
        },
      });

      const result = response.data?.bookCrmLeadMeeting;

      if (!result) {
        setBookingMessage({
          success: false,
          message: 'The meeting booking did not return a result.',
        });

        return;
      }

      setBookingMessage({
        success: result.success,
        message: result.message,
        conferenceLink: result.conferenceLink,
      });

      if (result.success) {
        setAvailabilityChecked(false);
      }
    } catch (error) {
      setBookingMessage({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Could not book the meeting.',
      });
    }
  };

  const availabilityStatus =
    availabilityChecked && availability
      ? availability.available
        ? 'available'
        : 'busy'
      : 'unchecked';

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        render={
          <Button
            variant="outline"
            size="sm"
            startIcon={<IconCalendarClock />}
          >
            Schedule meeting
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport>
          <Dialog.Popup size="lg">
            <Dialog.Header>
              <Dialog.Title>Schedule a lead meeting</Dialog.Title>
              <Dialog.Description>
                Check the owner’s Google Calendar before booking. Invitations
                are sent to the selected employee and lead when an email is
                available.
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 16,
                  }}
                >
                  <Field.Root name="ownerWorkspaceMemberId">
                    <Field.Label>Meeting owner</Field.Label>
                    <Select.Root
                      value={ownerWorkspaceMemberId || null}
                      onValueChange={(value) => {
                        setOwnerWorkspaceMemberId(value ?? '');
                        resetCheck();
                      }}
                      items={ownerOptions}
                    >
                      <Select.Trigger>
                        <Select.Value
                          placeholder={
                            loadingMembers
                              ? 'Loading team members…'
                              : 'Select owner'
                          }
                        />
                        <Select.Icon />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Positioner align="start" sideOffset={4}>
                          <Select.Popup>
                            {ownerOptions.map((option) => (
                              <Select.Item
                                key={option.value}
                                value={option.value}
                              >
                                <Select.ItemText>
                                  {option.label}
                                </Select.ItemText>
                                <Select.ItemIndicator />
                              </Select.Item>
                            ))}
                          </Select.Popup>
                        </Select.Positioner>
                      </Select.Portal>
                    </Select.Root>
                  </Field.Root>
                  <Field.Root name="employeeWorkspaceMemberId">
                    <Field.Label>Assigned employee</Field.Label>
                    <Select.Root
                      value={employeeWorkspaceMemberId || null}
                      onValueChange={(value) => {
                        setEmployeeWorkspaceMemberId(value ?? '');
                        resetCheck();
                      }}
                      items={ownerOptions}
                    >
                      <Select.Trigger>
                        <Select.Value placeholder="Select employee" />
                        <Select.Icon />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Positioner align="start" sideOffset={4}>
                          <Select.Popup>
                            {ownerOptions.map((option) => (
                              <Select.Item
                                key={option.value}
                                value={option.value}
                              >
                                <Select.ItemText>
                                  {option.label}
                                </Select.ItemText>
                                <Select.ItemIndicator />
                              </Select.Item>
                            ))}
                          </Select.Popup>
                        </Select.Positioner>
                      </Select.Portal>
                    </Select.Root>
                  </Field.Root>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 16,
                  }}
                >
                  <Field.Root name="startsAt">
                    <Field.Label>Start</Field.Label>
                    <Input
                      type="datetime-local"
                      value={startsAtLocal}
                      onChange={(event) => {
                        setStartsAtLocal(event.target.value);
                        resetCheck();
                      }}
                    />
                  </Field.Root>
                  <Field.Root name="endsAt">
                    <Field.Label>End</Field.Label>
                    <Input
                      type="datetime-local"
                      value={endsAtLocal}
                      onChange={(event) => {
                        setEndsAtLocal(event.target.value);
                        resetCheck();
                      }}
                    />
                  </Field.Root>
                </div>

                <Field.Root name="description">
                  <Field.Label>Meeting notes (optional)</Field.Label>
                  <Input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Agenda or context for the meeting"
                  />
                </Field.Root>

                <Text size="sm">
                  Times are checked in {timeZone}. Google Meet conferencing is
                  requested automatically.
                </Text>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    border: '1px solid var(--border-color, #d0d5dd)',
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <Text weight="medium">Calendar availability</Text>
                    {availabilityStatus === 'available' && (
                      <Badge color="green">Available</Badge>
                    )}
                    {availabilityStatus === 'busy' && (
                      <Badge color="red">Busy</Badge>
                    )}
                    {availabilityStatus === 'unchecked' && (
                      <Badge color="gray">Not checked</Badge>
                    )}
                  </div>

                  {availability?.busyIntervals.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Text size="sm">
                        Busy intervals in this window
                      </Text>
                      {availability.busyIntervals.map((interval) => (
                        <Text
                          key={interval.start + interval.end}
                          size="sm"
                        >
                          {formatBusyTime(interval.start, timeZone)} –{' '}
                          {formatBusyTime(interval.end, timeZone)}
                        </Text>
                      ))}
                    </div>
                  ) : availabilityStatus === 'available' ? (
                    <Text size="sm">
                      No conflicts found for this time.
                    </Text>
                  ) : null}

                  {availabilityError && (
                    <Text size="sm">{availabilityError.message}</Text>
                  )}

                  {bookingMessage && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        borderRadius: 8,
                        padding: 10,
                        border: '1px solid var(--border-color, #d0d5dd)',
                      }}
                    >
                      <Text size="sm">{bookingMessage.message}</Text>
                      {bookingMessage.conferenceLink && (
                        <a
                          href={bookingMessage.conferenceLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Text size="sm">Open Google Meet</Text>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.Close render={<Button variant="outline">Close</Button>} />
              <Button
                variant="outline"
                loading={checkingAvailability}
                disabled={
                  !ownerWorkspaceMemberId ||
                  !startsAtLocal ||
                  !endsAtLocal ||
                  booking
                }
                onClick={handleCheckAvailability}
              >
                Check availability
              </Button>
              <Button
                loading={booking}
                disabled={
                  !availabilityChecked ||
                  !availability?.available ||
                  !employeeWorkspaceMemberId ||
                  booking
                }
                startIcon={<IconVideo />}
                onClick={handleBookMeeting}
              >
                Book meeting
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

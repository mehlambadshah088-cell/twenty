import { Trans } from '@lingui/react/macro';

import { type Task } from '@/activities/types/Task';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { Button } from 'twenty-ui/primitives/input';
import { IconCheckbox } from 'twenty-ui/icon';

type LeadTaskRecord = Task & {
  leadId?: string;
  position?: 'last';
};

export const CreateLeadTaskButton = ({
  leadRecordId,
}: {
  leadRecordId: string;
}) => {
  const currentWorkspaceMember = useAtomStateValue(
    currentWorkspaceMemberState,
  );
  const { createOneRecord, loading } = useCreateOneRecord<LeadTaskRecord>({
    objectNameSingular: 'task',
    shouldMatchRootQueryFilter: true,
  });
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const handleCreateTask = async () => {
    const createdTask = await createOneRecord({
      leadId: leadRecordId,
      assigneeId: currentWorkspaceMember?.id ?? null,
      status: 'TODO',
      position: 'last',
    });

    openRecordInSidePanel({
      recordId: createdTask.id,
      objectNameSingular: 'task',
      isNewRecord: true,
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      startIcon={<IconCheckbox />}
      loading={loading}
      disabled={loading}
      onClick={handleCreateTask}
    >
      <Trans>Add task</Trans>
    </Button>
  );
};

import { Navigate, useParams } from 'react-router-dom';
import { AppPath, StandardObjectNameSingular } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';

import { WorkspaceRouteUnavailable } from '@/ui/layout/page/components/WorkspaceRouteUnavailable';
import { CreateLeadTaskButton } from '@/crm/components/CreateLeadTaskButton';
import { ScheduleLeadMeetingButton } from '@/crm/components/ScheduleLeadMeetingButton';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { findCoreObjectShowPage } from '@/object-core/utils/findCoreObjectShowPage';
import { isWorkspaceWorkflowVersionRouteHidden } from '@/object-core/workflows/utils/isWorkspaceWorkflowVersionRouteHidden';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useWorkspaceSurface } from '@/ui/layout/hooks/useWorkspaceSurface';
import { AiChatThreadPageContent } from '~/pages/ai-chat/AiChatThreadPageContent';
import {
  type RecordShowPageParameters,
  RecordShowPageContent,
} from '~/pages/object-record/RecordShowPageContent';

export const RecordShowPage = () => {
  const parameters = useParams<RecordShowPageParameters>();
  const workspaceSurface = useWorkspaceSurface();
  const { objectMetadataItems } = useObjectMetadataItems();
  const canCreateCalendarEvent = useHasPermissionFlag(
    PermissionFlagType.CREATE_CALENDAR_EVENT_TOOL,
  );

  const isInSidePanel = workspaceSurface.type === 'side-panel';
  const isRouteObjectMetadataAvailable =
    isDefined(parameters.objectNameSingular) &&
    objectMetadataItems.some(
      (objectMetadataItem) =>
        objectMetadataItem.nameSingular === parameters.objectNameSingular,
    );

  if (isInSidePanel && !isRouteObjectMetadataAvailable) {
    return <WorkspaceRouteUnavailable />;
  }

  if (
    parameters.objectNameSingular ===
      StandardObjectNameSingular.AgentChatThread &&
    isDefined(parameters.objectRecordId)
  ) {
    // A chat's record page is the chat page, on its own route
    if (!isInSidePanel) {
      return (
        <Navigate
          replace
          to={getAppPath(AppPath.AiChat, {
            threadId: parameters.objectRecordId,
          })}
        />
      );
    }

    return <AiChatThreadPageContent threadId={parameters.objectRecordId} />;
  }

  if (
    isWorkspaceWorkflowVersionRouteHidden({
      objectNameSingular: parameters.objectNameSingular,
    })
  ) {
    return <WorkspaceRouteUnavailable />;
  }

  const CoreObjectShowPage = findCoreObjectShowPage(
    parameters.objectNameSingular,
  );

  if (isDefined(CoreObjectShowPage) && isDefined(parameters.objectRecordId)) {
    return <CoreObjectShowPage objectRecordId={parameters.objectRecordId} />;
  }

  const leadHeaderActions =
    parameters.objectNameSingular === 'lead' &&
    isDefined(parameters.objectRecordId) ? (
      <>
        <CreateLeadTaskButton leadRecordId={parameters.objectRecordId} />
        {canCreateCalendarEvent ? (
          <ScheduleLeadMeetingButton leadRecordId={parameters.objectRecordId} />
        ) : null}
      </>
    ) : undefined;

  return (
    <RecordShowPageContent
      parameters={parameters}
      headerActions={leadHeaderActions}
    />
  );
};

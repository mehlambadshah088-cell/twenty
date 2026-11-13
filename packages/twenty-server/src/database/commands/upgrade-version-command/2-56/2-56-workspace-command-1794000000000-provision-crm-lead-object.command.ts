import { Inject } from '@nestjs/common';

import { Command } from 'nest-commander';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined } from 'twenty-shared/utils';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const CRM_LEAD_OBJECT_UNIVERSAL_IDENTIFIER =
  'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e1';

@Command({
  name: 'crm:provision-lead-object',
  description: doNotTranslate(
    'Create the CRM Lead object in provisioned workspaces',
  ),
})
export class ProvisionCrmLeadObjectCommand extends ProvisionedWorkspaceCommandRunner {
  @Inject(WorkspaceCacheService)
  private readonly workspaceCacheService: WorkspaceCacheService;

  @Inject(ObjectMetadataService)
  private readonly objectMetadataService: ObjectMetadataService;

  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
      ]);

    const existingLead =
      flatObjectMetadataMaps.byUniversalIdentifier[
        CRM_LEAD_OBJECT_UNIVERSAL_IDENTIFIER
      ];

    if (isDefined(existingLead)) {
      this.logger.log(
        doNotTranslate(
          `CRM Lead object already exists in workspace ${workspaceId}; skipping`,
        ),
      );

      return;
    }

    const conflictingObject = Object.values(
      flatObjectMetadataMaps.byUniversalIdentifier,
    ).find(
      (objectMetadata) =>
        objectMetadata.nameSingular.toLowerCase() === 'lead' ||
        objectMetadata.namePlural.toLowerCase() === 'leads',
    );

    if (isDefined(conflictingObject)) {
      throw new Error(
        `Cannot create CRM Lead: workspace ${workspaceId} already contains an object named "${conflictingObject.nameSingular}" with a different identifier.`,
      );
    }

    if (options.dryRun) {
      this.logger.log(
        doNotTranslate(
          `[DRY RUN] Would create CRM Lead object in workspace ${workspaceId}`,
        ),
      );

      return;
    }

    const createdLead = await this.objectMetadataService.createOneObject({
      workspaceId,
      createObjectInput: {
        nameSingular: 'lead',
        namePlural: 'leads',
        labelSingular: 'Lead',
        labelPlural: 'Leads',
        description:
          'CRM lead records for prospect qualification and follow-up.',
        icon: 'IconTarget',
        universalIdentifier: CRM_LEAD_OBJECT_UNIVERSAL_IDENTIFIER,
      },
    });

    this.logger.log(
      doNotTranslate(
        `Created CRM Lead object (${createdLead.id}) in workspace ${workspaceId}`,
      ),
    );
  }
}
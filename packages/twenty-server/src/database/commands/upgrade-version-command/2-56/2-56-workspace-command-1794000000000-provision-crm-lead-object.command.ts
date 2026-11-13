import { Command } from 'nest-commander';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined } from 'twenty-shared/utils';

import {
  ProvisionedWorkspaceCommandRunner,
  type ProvisionedWorkspaceCommandOptions,
} from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { type CreateFieldInput } from 'src/engine/metadata-modules/field-metadata/dtos/create-field.input';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const CRM_LEAD_OBJECT_UNIVERSAL_IDENTIFIER =
  'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e1';

const CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS = {
  company: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e2',
  emails: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e3',
  phones: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e4',
  source: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e5',
  stage: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e6',
  assignedTo: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e7',
  nextFollowUpAt: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e8',
  lastContactedAt: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094e9',
  notes: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094ea',
} as const;

@Command({
  name: 'crm:provision-lead-object',
  description: doNotTranslate(
    'Create the CRM Lead object and its fields in one workspace',
  ),
})
export class ProvisionCrmLeadObjectCommand extends ProvisionedWorkspaceCommandRunner<ProvisionedWorkspaceCommandOptions> {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly fieldMetadataService: FieldMetadataService,
  ) {
    super(workspaceIteratorService);
  }

  override async run(
    passedParams: string[],
    options: ProvisionedWorkspaceCommandOptions,
  ): Promise<void> {
    if (!options.workspaceId || options.workspaceId.size !== 1) {
      throw new Error(
        'This CRM provisioning command requires exactly one --workspace-id. It is intentionally blocked from running across every workspace.',
      );
    }

    await super.run(passedParams, options);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
      ]);

    let leadObjectMetadata =
      flatObjectMetadataMaps.byUniversalIdentifier[
        CRM_LEAD_OBJECT_UNIVERSAL_IDENTIFIER
      ];

    if (!isDefined(leadObjectMetadata)) {
      const conflictingObject = Object.values(
        flatObjectMetadataMaps.byUniversalIdentifier,
      )
        .filter(isDefined)
        .find(
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
            `[DRY RUN] Would create the CRM Lead object and its fields in workspace ${workspaceId}`,
          ),
        );

        return;
      }

      leadObjectMetadata = await this.objectMetadataService.createOneObject({
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
          `Created CRM Lead object (${leadObjectMetadata.id}) in workspace ${workspaceId}`,
        ),
      );
    }

    const {
      flatObjectMetadataMaps: refreshedFlatObjectMetadataMaps,
      flatFieldMetadataMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
    ]);

    leadObjectMetadata =
      refreshedFlatObjectMetadataMaps.byUniversalIdentifier[
        CRM_LEAD_OBJECT_UNIVERSAL_IDENTIFIER
      ];

    if (!isDefined(leadObjectMetadata)) {
      throw new Error(
        `CRM Lead object was not available after provisioning in workspace ${workspaceId}.`,
      );
    }

    const workspaceMemberObjectMetadata =
      refreshedFlatObjectMetadataMaps.byUniversalIdentifier[
        STANDARD_OBJECTS.workspaceMember.universalIdentifier
      ];

    if (!isDefined(workspaceMemberObjectMetadata)) {
      throw new Error(
        `Cannot provision CRM Lead assignment: workspaceMember object is missing in workspace ${workspaceId}.`,
      );
    }

    const createFieldInputs: Omit<CreateFieldInput, 'workspaceId'>[] = [
      {
        objectMetadataId: leadObjectMetadata.id,
        universalIdentifier:
          CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS.company,
        type: FieldMetadataType.TEXT,
        name: 'company',
        label: 'Company',
        description: 'Company or organization associated with this lead.',
        icon: 'IconBuilding',
        isNullable: true,
        isSearchable: true,
      },
      {
        objectMetadataId: leadObjectMetadata.id,
        universalIdentifier:
          CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS.emails,
        type: FieldMetadataType.EMAILS,
        name: 'emails',
        label: 'Email',
        description: 'Primary email address for this lead.',
        icon: 'IconMail',
        isNullable: true,
        settings: { maxNumberOfValues: 1 },
      },
      {
        objectMetadataId: leadObjectMetadata.id,
        universalIdentifier:
          CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS.phones,
        type: FieldMetadataType.PHONES,
        name: 'phones',
        label: 'Phone',
        description: 'Primary phone number for this lead.',
        icon: 'IconPhone',
        isNullable: true,
        settings: { maxNumberOfValues: 1 },
      },
      {
        objectMetadataId: leadObjectMetadata.id,
        universalIdentifier:
          CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS.source,
        type: FieldMetadataType.SELECT,
        name: 'source',
        label: 'Source',
        description: 'How this lead entered the CRM.',
        icon: 'IconRoute',
        isNullable: true,
        options: [
          {
            id: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094eb',
            value: 'WEBSITE',
            label: 'Website',
            position: 0,
            color: 'blue',
          },
          {
            id: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094ec',
            value: 'REFERRAL',
            label: 'Referral',
            position: 1,
            color: 'green',
          },
          {
            id: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094ed',
            value: 'LINKEDIN',
            label: 'LinkedIn',
            position: 2,
            color: 'turquoise',
          },
          {
            id: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094ee',
            value: 'COLD_CALL',
            label: 'Cold call',
            position: 3,
            color: 'orange',
          },
          {
            id: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094ef',
            value: 'EMAIL_CAMPAIGN',
            label: 'Email campaign',
            position: 4,
            color: 'violet',
          },
          {
            id: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094f0',
            value: 'OTHER',
            label: 'Other',
            position: 5,
            color: 'gray',
          },
        ],
      },
      {
        objectMetadataId: leadObjectMetadata.id,
        universalIdentifier:
          CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS.stage,
        type: FieldMetadataType.SELECT,
        name: 'stage',
        label: 'Stage',
        description: 'Current qualification stage of this lead.',
        icon: 'IconProgressCheck',
        isNullable: false,
        defaultValue: "'COLD'",
        options: [
          {
            id: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094f1',
            value: 'COLD',
            label: 'Cold',
            position: 0,
            color: 'gray',
          },
          {
            id: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094f2',
            value: 'WARM',
            label: 'Warm',
            position: 1,
            color: 'amber',
          },
          {
            id: 'c6240a9b-1c7a-4ef5-8cb7-4e42d1c094f3',
            value: 'HOT',
            label: 'Hot',
            position: 2,
            color: 'red',
          },
        ],
      },
      {
        objectMetadataId: leadObjectMetadata.id,
        universalIdentifier:
          CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS.assignedTo,
        type: FieldMetadataType.RELATION,
        name: 'assignedTo',
        label: 'Assigned To',
        description: 'Workspace member responsible for this lead.',
        icon: 'IconUser',
        isNullable: true,
        relationCreationPayload: {
          type: RelationType.MANY_TO_ONE,
          targetObjectMetadataId: workspaceMemberObjectMetadata.id,
          targetFieldLabel: 'Assigned Leads',
          targetFieldIcon: 'IconTarget',
        },
      },
      {
        objectMetadataId: leadObjectMetadata.id,
        universalIdentifier:
          CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS.nextFollowUpAt,
        type: FieldMetadataType.DATE_TIME,
        name: 'nextFollowUpAt',
        label: 'Next Follow-up',
        description: 'Date and time for the next planned follow-up.',
        icon: 'IconCalendarClock',
        isNullable: true,
      },
      {
        objectMetadataId: leadObjectMetadata.id,
        universalIdentifier:
          CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS.lastContactedAt,
        type: FieldMetadataType.DATE_TIME,
        name: 'lastContactedAt',
        label: 'Last Contacted',
        description: 'Date and time this lead was last contacted.',
        icon: 'IconCalendarCheck',
        isNullable: true,
      },
      {
        objectMetadataId: leadObjectMetadata.id,
        universalIdentifier: CRM_LEAD_FIELD_UNIVERSAL_IDENTIFIERS.notes,
        type: FieldMetadataType.RICH_TEXT,
        name: 'notes',
        label: 'Notes',
        description: 'Notes and context about this lead.',
        icon: 'IconNotes',
        isNullable: true,
      },
    ];

    const expectedFieldUniversalIdentifiersByName = new Map(
      createFieldInputs.map((field) => [
        field.name,
        field.universalIdentifier,
      ]),
    );

    const conflictingField = Object.values(
      flatFieldMetadataMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .find(
        (field) =>
          field.objectMetadataId === leadObjectMetadata.id &&
          expectedFieldUniversalIdentifiersByName.has(field.name) &&
          expectedFieldUniversalIdentifiersByName.get(field.name) !==
            field.universalIdentifier,
      );

    if (isDefined(conflictingField)) {
      throw new Error(
        `Cannot provision CRM Lead field "${conflictingField.name}" in workspace ${workspaceId}: a field with the same name already exists with a different identifier.`,
      );
    }

    const missingFieldInputs = createFieldInputs.filter(
      (field) =>
        !isDefined(
          flatFieldMetadataMaps.byUniversalIdentifier[
            field.universalIdentifier ?? ''
          ],
        ),
    );

    if (missingFieldInputs.length === 0) {
      this.logger.log(
        doNotTranslate(
          `CRM Lead object and all ${createFieldInputs.length} custom fields are already present in workspace ${workspaceId}; skipping`,
        ),
      );

      return;
    }

    if (options.dryRun) {
      this.logger.log(
        doNotTranslate(
          `[DRY RUN] Would create ${missingFieldInputs.length} CRM Lead field(s) in workspace ${workspaceId}: ${missingFieldInputs.map((field) => field.name).join(', ')}`,
        ),
      );

      return;
    }

    await this.fieldMetadataService.createManyFields({
      createFieldInputs: missingFieldInputs,
      workspaceId,
      shouldDeferActions: false,
    });

    this.logger.log(
      doNotTranslate(
        `Created ${missingFieldInputs.length} CRM Lead field(s) in workspace ${workspaceId}: ${missingFieldInputs.map((field) => field.name).join(', ')}`,
      ),
    );
  }
}

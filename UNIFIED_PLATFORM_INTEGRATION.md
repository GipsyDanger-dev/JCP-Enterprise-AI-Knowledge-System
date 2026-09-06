# Unified Platform Integration

Status: in progress; product decisions pending. No production migration or deployment authorized.

## Agreed Behavior

- One application and public domain.
- Personal users register themselves and enter their private space.
- Organization administrators create employee accounts; login enters the assigned organization directly.
- Companies and Sleman use the same organization model and shared features.
- AI personalization belongs to the workspace, not a separate application type.
- Preserve existing document, reading, announcement, messaging, profile, and accessibility workflows.

## Source Checkpoints

Remote refs fetched on 2026-09-06:

- Integration branch: `feat/unified-platform`.
- Local main baseline: `1031e99`.
- Existing layout changes preserved in `6e79af2`.
- Code checkpoint: `checkpoint-before-unified-platform-20260906`.
- SlemaN source: `2aedc7b`.
- Personal source: `b96b34b`.

The checkpoint covers Git-tracked code only, not database contents or environment secrets.
Merge-tree simulations left the working tree untouched: SlemaN conflicts in 16 files;
Personal conflicts in 11 files. These are separate simulations against the baseline,
not the final conflict count for the combined result.

## Verified Integration Constraints

- Personal's schema has account type and Google identity, but no workspace entity.
- Personal document listing limits personal users by uploader; an organization admin's
  listing has no organization boundary. Download and chunk lookup similarly only
  add uploader restrictions for personal accounts.
- Personal AI queries filter by uploader for personal users, by role for organization
  employees, and omit retrieval filters for organization administrators.
- Categories in Personal are global. They must become workspace-local alongside
  documents, announcements, users, required reading, messaging, and audit access.
- All AI paths need the same boundary: retrieval, inventory/metadata answers,
  follow-up context, and citation validation. Restricting only the document list is insufficient.
- Keep main's multipart ingestion and realtime messaging while incorporating shared
  AI clarification and metadata-answer behavior from the alternative branches.
- Sleman legal metadata and unit-management capabilities must remain usable within
  the shared organization model; do not introduce a separate Sleman account type.
- Preserve existing migration files and assess overlapping role migrations before
  applying new migrations. Use an isolated integration database; do not run the
  alternate startup scripts against the existing database.

## Completed Independent Changes

- Integrated configurable `SUMOPOD_BASE_URL` from the shared SlemaN/Personal AI
  foundation, retaining the existing provider default and removing trailing slashes.
  This is deployment configuration, not workspace-specific personalization.

## Pending Product Decisions

1. Does the platform owner create organizations and their first administrator, or
   can organizations register themselves? Awaiting user response.
2. Is an account bound to one personal/organization space, or can one identity have
   personal space plus organization memberships? Awaiting user response.

These decisions affect identity uniqueness, session context, provisioning, and
database relationships. Do not finalize those contracts before the response.

## Integration and Verification Gates

1. Resolve the two product decisions and establish workspace/session contracts.
2. Integrate source behavior with additive migration and explicit legacy-data mapping.
3. Enforce workspace boundaries in every backend operation and AI query; derive the
   active workspace from authenticated server state, not client-supplied authority.
4. Connect personal registration and organization-admin provisioning to direct-login
   routing; preserve optional Google login configuration.
5. Carry organization AI personalization through authenticated backend requests.
6. Validate against an isolated database before considering a production migration.

Required acceptance evidence:

- Two personal users and two organizations cannot list, read, edit, download, delete,
  assign, or retrieve AI answers from each other's data, including direct ID requests.
- Organization admins manage only their own employees and content.
- Personal registration cannot select administrator privileges or another workspace.
- Login, logout, expired sessions, and inactive accounts preserve workspace boundaries.
- Categories, document ingestion/preview, required-reading assignment/progress/completion,
  announcement previews/readership, and messaging work within the intended workspace.
- AI metadata answers, citations, follow-ups, and failures cannot expose foreign data.
- Existing database records retain their files, reading history, and ownership after
  migration; verify migration on a restored copy and keep a database backup.
- Frontend/backend builds, relevant Python/backend tests, and browser flows pass.
- Staging supports a single public origin with backend routing and internal AI service.

Passing builds alone does not establish completion. Push and deployment remain separate actions.

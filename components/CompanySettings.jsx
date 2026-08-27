'use client';

import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useConfigMutations } from '../hooks/useConfigMutations.js';
import { DomainDialog } from './DomainDialog.jsx';
import { EmploymentTypeDialog } from './EmploymentTypeDialog.jsx';
import { EmptyState } from './EmptyState.jsx';
import { PageHeader } from './PageHeader.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';

/**
 * S-18. The company-wide half of the FR-6.4 configuration list.
 *
 * Pure: both lists arrive as props and every action leaves through a callback.
 * The viewer's permission arrives as `canWrite` rather than a role name, so
 * moving config.write on S-19 changes this screen with no code change.
 */

/** Both panels are the same shape: a heading, one action, and a list or a reason it is empty. */
function ConfigPanel({ title, description, action, empty, columns, children }) {
  return (
    <Paper variant='outlined'>
      <Stack spacing={2} sx={{ p: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <Stack spacing={1}>
            <Typography variant='sectionTitle'>{title}</Typography>
            <Typography variant='body2' color='text.secondary'>
              {description}
            </Typography>
          </Stack>
          {action}
        </Stack>

        {empty ?? (
          <Table>
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell key={column}>{column}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>{children}</TableBody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}

export function CompanySettings({ employmentTypes, domains, canWrite }) {
  const [typeDialog, setTypeDialog] = useState(null);
  const [domainDialog, setDomainDialog] = useState(false);
  const [removing, setRemoving] = useState(null);

  const {
    createEmploymentType,
    renameEmploymentType,
    softDeleteEmploymentType,
    addDomain,
    removeDomain,
    pending,
    error,
    conflict,
    dismissConflict,
  } = useConfigMutations();

  // `removing` carries which kind of record is being removed, so one dialog
  // serves both lists without either one guessing what the other meant.
  const confirmRemoval = (reason) => {
    const { kind, record } = removing;
    const body = { reason, version: record.version };

    return kind === 'employmentType'
      ? softDeleteEmploymentType(record._id, body)
      : removeDomain(record._id, body);
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Company configuration'
        description='Settings that are not per team. Everything per-team lives on that team’s configuration screen instead.'
      />

      {/* FR-3.10 and DC-5: worth stating on the screen, because its absence
          looks like an omission rather than a decision. */}
      <Alert severity='info'>
        There is deliberately no company-wide default timezone and none can be
        set here. Every timestamp resolves through the timezone of the shift
        that applies to that user on that date.
      </Alert>

      {conflict ? (
        // P-47: two administrators on the same configuration is the normal case.
        <Alert severity='warning' onClose={dismissConflict}>
          This record changed since you loaded it, so your write was rejected
          rather than overwriting theirs. Reload to see the current state.
        </Alert>
      ) : null}

      <ConfigPanel
        title='Employment types'
        description='Classifies the kind of staff member. No permission depends on employment type, and a type is never deleted while anyone still holds it.'
        columns={['Name', 'Actions']}
        action={
          canWrite ? (
            <Button variant='contained' onClick={() => setTypeDialog({})}>
              New employment type
            </Button>
          ) : null
        }
        empty={
          employmentTypes.length === 0 ? (
            <EmptyState
              icon={<BadgeOutlined fontSize='large' />}
              title='No employment type yet'
              description='Every user carries one, so at least one type has to exist before a user can be created or imported.'
            />
          ) : null
        }
      >
        {employmentTypes.map((type) => (
          <TableRow key={type._id} hover>
            <TableCell>{type.name}</TableCell>
            <TableCell>
              {canWrite ? (
                <Stack direction='row' spacing={1}>
                  <IconButton
                    aria-label={`Rename ${type.name}`}
                    onClick={() => setTypeDialog(type)}
                  >
                    <EditOutlined fontSize='small' />
                  </IconButton>
                  <IconButton
                    aria-label={`Remove ${type.name}`}
                    onClick={() =>
                      setRemoving({ kind: 'employmentType', record: type })
                    }
                  >
                    <DeleteOutlined fontSize='small' />
                  </IconButton>
                </Stack>
              ) : (
                '—'
              )}
            </TableCell>
          </TableRow>
        ))}
      </ConfigPanel>

      <ConfigPanel
        title='Authorised Google Workspace domains'
        description='Sign in is refused for any account outside these domains. Matching one is necessary but not sufficient — the account must also match a user with login enabled whose employment period covers today.'
        columns={['Domain', 'Actions']}
        action={
          canWrite ? (
            <Button variant='contained' onClick={() => setDomainDialog(true)}>
              Authorise a domain
            </Button>
          ) : null
        }
        empty={
          domains.length === 0 ? (
            <EmptyState
              icon={<LanguageOutlined fontSize='large' />}
              title='No domain is authorised'
              description='Nobody can sign in until at least one Workspace domain is authorised here.'
            />
          ) : null
        }
      >
        {domains.map((entry) => (
          <TableRow key={entry._id} hover>
            <TableCell>
              <Typography variant='mono'>{entry.domain}</Typography>
            </TableCell>
            <TableCell>
              {canWrite ? (
                <IconButton
                  aria-label={`Remove ${entry.domain}`}
                  onClick={() => setRemoving({ kind: 'domain', record: entry })}
                >
                  <DeleteOutlined fontSize='small' />
                </IconButton>
              ) : (
                '—'
              )}
            </TableCell>
          </TableRow>
        ))}
      </ConfigPanel>

      {/* A routed, gated screen nobody links to has not shipped. S-26 is
          company configuration like the two panels above, so this is where a
          reader looking for it goes first. `href`, never `component={Link}` —
          a server component cannot pass a function to a client one. */}
      <Paper variant='outlined'>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <Stack spacing={1}>
              <Typography variant='sectionTitle'>Holiday calendars</Typography>
              <Typography variant='body2' color='text.secondary'>
                The holidays and non-working days every team observes. A
                calendar is shared — two or three serve the whole company — and
                each team is assigned exactly one.
              </Typography>
            </Stack>
            <Button
              variant='outlined'
              href='/settings/holiday-calendars'
              startIcon={<EventOutlined />}
            >
              Open holiday calendars
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <EmploymentTypeDialog
        open={Boolean(typeDialog)}
        onClose={() => setTypeDialog(null)}
        onSubmit={(data) =>
          typeDialog?._id
            ? renameEmploymentType(typeDialog._id, {
                ...data,
                version: typeDialog.version,
              })
            : createEmploymentType(data)
        }
        initial={typeDialog?._id ? typeDialog : null}
        pending={pending}
        error={error}
      />

      <DomainDialog
        open={domainDialog}
        onClose={() => setDomainDialog(false)}
        onSubmit={addDomain}
        pending={pending}
        error={error}
      />

      <ReasonDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemoval}
        title={
          removing?.kind === 'domain'
            ? 'Remove this authorised domain'
            : 'Remove this employment type'
        }
        description={
          removing?.kind === 'domain'
            ? 'Accounts on this domain can no longer sign in. Nothing is destroyed — the record is kept so past sign-in decisions still resolve, and the last remaining domain cannot be removed.'
            : 'Nothing is destroyed. The type is kept so every user who ever held it still resolves its name, and the removal is refused while anyone currently holds it.'
        }
        confirmLabel='Remove'
        confirmColor='error'
        pending={pending}
        error={error}
      />
    </Stack>
  );
}
